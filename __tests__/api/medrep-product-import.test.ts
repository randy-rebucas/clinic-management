import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));
vi.mock('@/models/Product', () => ({ default: { find: vi.fn(), insertMany: vi.fn(), create: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import Product from '@/models/Product';
import { POST } from '@/app/api/medical-representatives/products/import/route';
import { POST as createOne } from '@/app/api/medical-representatives/products/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const ROW = {
  name: 'Amlodipine',
  category: 'Antihypertensive',
  manufacturer: 'Acme Pharma',
  description: 'Calcium channel blocker',
  packaging: 'Box of 30 tablets',
  expiryDate: '2027-03-31',
  strength: '5 mg',
};

const req = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
const post = (body: unknown) => POST(req('http://x/api/medical-representatives/products/import', body));
const existing = (rows: { name: string; strength?: string }[]) =>
  vi.mocked(Product.find).mockReturnValue({ select: () => ({ lean: async () => rows }) } as any);

describe('POST /api/medical-representatives/products/import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    existing([]);
    vi.mocked(Product.insertMany).mockResolvedValue([] as any);
  });

  it('creates every row as the rep’s own active product', async () => {
    const res = await post({ products: [ROW, { ...ROW, name: 'Losartan', strength: '50 mg', status: 'discontinued' }] });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ created: 2, skipped: [] });
    const docs = vi.mocked(Product.insertMany).mock.calls[0][0] as any[];
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ userId: USER, name: 'Amlodipine', status: 'active', specifications: [] });
    expect(docs[0].expiryDate).toBeInstanceOf(Date);
    expect(docs[1].status).toBe('discontinued');
  });

  it('saves nothing and lists every bad row', async () => {
    const res = await post({ products: [ROW, { ...ROW, manufacturer: '' }, { ...ROW, expiryDate: 'soon' }] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_ROWS');
    expect(json.rows).toEqual([
      { row: 1, error: 'Missing required fields' },
      { row: 2, error: 'Invalid expiry date.' },
    ]);
    expect(Product.insertMany).not.toHaveBeenCalled();
  });

  it('skips products the rep already has and repeats within the file', async () => {
    existing([{ name: 'amlodipine ', strength: '5  MG' }]);
    const res = await post({ products: [ROW, { ...ROW, name: 'Losartan' }, { ...ROW, name: 'LOSARTAN' }] });
    expect((await res.json()).data).toEqual({
      created: 1,
      skipped: [
        { row: 0, name: 'Amlodipine' },
        { row: 2, name: 'LOSARTAN' },
      ],
    });
    expect(vi.mocked(Product.insertMany).mock.calls[0][0]).toHaveLength(1);
  });

  it('writes nothing when every row is already there', async () => {
    existing([{ name: 'Amlodipine', strength: '5 mg' }]);
    expect((await (await post({ products: [ROW] })).json()).data.created).toBe(0);
    expect(Product.insertMany).not.toHaveBeenCalled();
  });

  it('needs 1 to 200 rows', async () => {
    expect((await post({ products: [] })).status).toBe(400);
    expect((await post({ products: Array(201).fill(ROW) })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });
});

describe('POST /api/medical-representatives/products after sharing the row rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(Product.create).mockImplementation(async (doc: any) => doc);
  });

  it('still creates one product and refuses a bad one', async () => {
    const ok = await createOne(req('http://x/api/medical-representatives/products', ROW));
    expect(ok.status).toBe(200);
    expect(vi.mocked(Product.create).mock.calls[0][0]).toMatchObject({ userId: USER, name: 'Amlodipine', strength: '5 mg', status: 'active' });
    const bad = await createOne(req('http://x/api/medical-representatives/products', { ...ROW, status: 'retired' }));
    expect(await bad.json()).toMatchObject({ error: 'Invalid status value.' });
  });
});
