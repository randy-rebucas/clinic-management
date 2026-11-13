import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));
vi.mock('@/app/api/medical-representatives/_lib/rep-product-input', () => ({
  readProductInput: vi.fn(),
  VALID_PRODUCT_STATUSES: ['active', 'discontinued', 'inactive'],
}));
vi.mock('@/models/Product', () => ({ default: { find: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import Product from '@/models/Product';
import { GET } from '@/app/api/medical-representatives/products/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
let sortUsed: unknown;
const get = (qs: string) => GET(new NextRequest(`http://x/api/medical-representatives/products?${qs}`));
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('GET /api/medical-representatives/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T02:00:00.000Z')); // Fri 13 Nov, 10:00 Manila
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(Product.find).mockImplementation(() => {
      const q: any = { sort: (s: unknown) => ((sortUsed = s), q), skip: () => q, limit: () => q, lean: async () => [] };
      return q;
    });
    vi.mocked(Product.countDocuments).mockResolvedValue(0 as any);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps newest first by default, and sorts by name or expiry when asked', async () => {
    await get('');
    expect(sortUsed).toEqual({ createdAt: -1 });
    await get('sort=name');
    expect(sortUsed).toEqual({ name: 1, createdAt: -1 });
    expect((await get('sort=price')).status).toBe(400);
  });

  it('expiring=1 lists active products through 30 days from today (expired included), soonest first', async () => {
    await get('expiring=1&status=inactive');
    const q = vi.mocked(Product.find).mock.calls[0][0] as any;
    expect(q.status).toBe('active');
    expect(q.expiryDate).toEqual({ $lt: day('2026-12-14') });
    expect(q.expiryDate.$gte).toBeUndefined();
    expect(sortUsed).toEqual({ expiryDate: 1, name: 1 });
  });

  it('searches name, manufacturer and category, with regex characters escaped', async () => {
    await get('search=amlo%20(5');
    const q = vi.mocked(Product.find).mock.calls[0][0] as any;
    expect(q.$or.map((o: any) => Object.keys(o)[0])).toEqual(['name', 'manufacturer', 'category']);
    expect(() => new RegExp(q.$or[0].name.$regex)).not.toThrow();
    expect(q.userId).toBe(USER);
  });

  it('summary=1 counts the rep’s active products by days left, on Manila days, ignoring other filters', async () => {
    vi.mocked(Product.aggregate).mockResolvedValue([
      { _id: 'expired', n: 1 },
      { _id: 'soon', n: 2 },
      { _id: 'later', n: 7 },
    ] as any);
    const body = await (await get('summary=1&search=x&status=inactive')).json();
    expect(body.expiry).toEqual({ expired: 1, soon: 2, quarter: 0, half: 0, later: 7 });

    const [match, group] = vi.mocked(Product.aggregate).mock.calls[0][0] as any[];
    expect(match.$match).toEqual({ userId: USER, status: 'active' });
    const edges = group.$group._id.$switch.branches.map((b: any) => b.case.$lt[1]);
    expect(edges).toEqual([day('2026-11-13'), day('2026-12-14'), day('2027-02-12'), day('2027-05-13')]);
  });
});
