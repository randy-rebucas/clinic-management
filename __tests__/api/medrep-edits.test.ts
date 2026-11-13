import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
  repProfileFilter: vi.fn(),
}));
vi.mock('@/models/Product', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), countDocuments: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { resolveLinkedClinic, resolveVisitProducts } from '@/app/api/medical-representatives/_lib/rep-visit-input';
import Product from '@/models/Product';
import { PUT } from '@/app/api/medical-representatives/products/[id]/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const REP = { userObjectId: USER, ownerFilter: { userId: USER } } as any;
const PRODUCT = '507f1f77bcf86cd7994390ee';
const OTHER = '507f1f77bcf86cd7994390ef';
const lean = <T,>(value: T) => ({ select: () => ({ lean: async () => value }), lean: async () => value });

describe('PUT /api/medical-representatives/products/[id]', () => {
  const BODY = {
    name: 'Amlodipine',
    category: 'Cardio',
    manufacturer: 'Acme',
    description: 'Calcium channel blocker',
    packaging: 'Box of 30',
    expiryDate: '2027-03-31',
  };
  const put = (body: unknown) =>
    PUT(new NextRequest(`http://x/api/medical-representatives/products/${PRODUCT}`, { method: 'PUT', body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: PRODUCT }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue(REP);
    vi.mocked(Product.findOne).mockReturnValue(lean({ expiryDate: new Date('2027-03-31') }) as any);
    vi.mocked(Product.findOneAndUpdate).mockReturnValue(lean({ _id: PRODUCT }) as any);
  });

  it('clears an emptied strength and dosage instead of keeping the old value', async () => {
    expect((await put({ ...BODY, strength: '', dosage: '' })).status).toBe(200);
    const update = vi.mocked(Product.findOneAndUpdate).mock.calls[0][1] as any;
    expect(update.$unset).toMatchObject({ strength: 1, dosage: 1 });
    expect(update.$set).not.toHaveProperty('strength');
    expect(update.$set).not.toHaveProperty('dosage');
  });

  it('sets them when given, with no $unset when nothing is cleared', async () => {
    await put({ ...BODY, strength: '5 mg', dosage: 'Once daily' });
    const update = vi.mocked(Product.findOneAndUpdate).mock.calls[0][1] as any;
    expect(update.$set).toMatchObject({ strength: '5 mg', dosage: 'Once daily' });
    expect(update).not.toHaveProperty('$unset');
  });
});

describe('editing a visit keeps what it already had', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a product that has since gone inactive, and checks only the added ones', async () => {
    vi.mocked(Product.countDocuments).mockResolvedValue(1 as any);
    const ids = await resolveVisitProducts(REP, [PRODUCT, OTHER], [new Types.ObjectId(PRODUCT)]);
    expect((ids as Types.ObjectId[]).map(String)).toEqual([PRODUCT, OTHER]);
    expect((vi.mocked(Product.countDocuments).mock.calls[0][0] as any)._id.$in.map(String)).toEqual([OTHER]);
  });

  it('still refuses a newly added product that isn’t the rep’s active one', async () => {
    vi.mocked(Product.countDocuments).mockResolvedValue(0 as any);
    expect(await resolveVisitProducts(REP, [PRODUCT, OTHER], [PRODUCT])).toBeInstanceOf(NextResponse);
  });

  it('leaves the current clinic link alone without checking access again', async () => {
    expect(await resolveLinkedClinic(REP, PRODUCT, new Types.ObjectId(PRODUCT))).toBeUndefined();
  });
});
