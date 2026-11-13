import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
  repProfileFilter: vi.fn(() => ({})),
}));
const chain = (value: unknown) => {
  const q: any = { select: () => q, sort: () => q, limit: () => q, lean: async () => value };
  return q;
};
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { countDocuments: vi.fn(), find: vi.fn(), aggregate: vi.fn() } }));
vi.mock('@/models/Product', () => ({ default: { countDocuments: vi.fn() } }));
vi.mock('@/models/SupportRequest', () => ({ default: { countDocuments: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Visit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import SupportRequest from '@/models/SupportRequest';
import { GET } from '@/app/api/medical-representatives/dashboard/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('GET /api/medical-representatives/dashboard weeklyVisits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Thursday 13 Nov 2026, 10:00 in Manila: this week starts Monday 9 Nov.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T02:00:00.000Z'));
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(MedicalRepresentative.findOne).mockReturnValue(chain({ firstName: 'Ana' }) as any);
    vi.mocked(Visit.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(Visit.find).mockReturnValue(chain([]) as any);
    vi.mocked(Product.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(SupportRequest.countDocuments).mockResolvedValue(0 as any);
  });
  afterEach(() => vi.useRealTimers());

  it('returns eight Monday weeks, oldest first, with each day counted in its own week', async () => {
    vi.mocked(Visit.aggregate).mockResolvedValue([
      { _id: day('2026-09-21'), completed: 1, open: 0 }, // Monday of the first week
      { _id: day('2026-09-27'), completed: 2, open: 1 }, // its Sunday
      { _id: day('2026-11-08'), completed: 1, open: 0 }, // Sunday before this week
      { _id: day('2026-11-09'), completed: 3, open: 0 }, // this Monday
      { _id: day('2026-11-15'), completed: 0, open: 2 }, // this Sunday
    ] as any);

    const res = await GET(new NextRequest('http://x/api/medical-representatives/dashboard'));
    const { data } = await res.json();

    expect(data.weeklyVisits.map((w: any) => w.week)).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
    expect(data.weeklyVisits[0]).toMatchObject({ completed: 3, open: 1 });
    expect(data.weeklyVisits[6]).toMatchObject({ completed: 1, open: 0 });
    expect(data.weeklyVisits[7]).toMatchObject({ completed: 3, open: 2 });

    const match = (vi.mocked(Visit.aggregate).mock.calls[0][0] as any[])[0].$match;
    expect(match.date.$gte).toEqual(day('2026-09-21'));
    expect(match.date.$lt).toEqual(day('2026-11-16'));
    expect(match.status.$in).toEqual(['completed', 'scheduled', 'requested']);
    expect(match.userId).toBe(USER);
  });

  it('sends zeros for weeks with no visits', async () => {
    vi.mocked(Visit.aggregate).mockResolvedValue([] as any);
    const { data } = await (await GET(new NextRequest('http://x/api/medical-representatives/dashboard'))).json();
    expect(data.weeklyVisits).toHaveLength(8);
    expect(data.weeklyVisits.every((w: any) => w.completed === 0 && w.open === 0)).toBe(true);
  });
});
