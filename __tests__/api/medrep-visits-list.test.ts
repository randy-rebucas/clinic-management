import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
  repProfileFilter: vi.fn(() => ({})),
}));
vi.mock('@/lib/rep-visits', () => ({}));
vi.mock('@/lib/rep-billing', () => ({}));
vi.mock('@/app/api/medical-representatives/_lib/rep-visit-input', () => ({}));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { find: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import Visit from '@/models/MedicalRepresentativeVisit';
import { GET } from '@/app/api/medical-representatives/visits/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
let sortUsed: Record<string, number> | undefined;
const get = (qs: string) => GET(new NextRequest(`http://x/api/medical-representatives/visits?${qs}`));

describe('GET /api/medical-representatives/visits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    // Friday 13 Nov 2026, 10:00 in Manila.
    vi.setSystemTime(new Date('2026-11-13T02:00:00.000Z'));
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(Visit.find).mockImplementation(() => {
      const q: any = {
        sort: (s: Record<string, number>) => ((sortUsed = s), q),
        skip: () => q,
        limit: () => q,
        lean: async () => [],
      };
      return q;
    });
    vi.mocked(Visit.countDocuments).mockResolvedValue(0 as any);
  });
  afterEach(() => vi.useRealTimers());

  it('orders a day’s visits by time, latest first, then earliest first with sort=asc', async () => {
    await get('');
    expect(sortUsed).toEqual({ date: -1, time: -1, createdAt: -1 });
    await get('sort=asc');
    expect(sortUsed).toEqual({ date: 1, time: 1, createdAt: 1 });
  });

  it('sends no summary unless asked', async () => {
    const body = await (await get('status=completed')).json();
    expect(body).not.toHaveProperty('summary');
    expect(Visit.aggregate).not.toHaveBeenCalled();
  });

  it('summary=1 buckets outcomes without the status filter, counting only past open visits', async () => {
    vi.mocked(Visit.aggregate).mockResolvedValue([
      { _id: { status: 'completed', past: true }, n: 5 },
      { _id: { status: 'completed', past: false }, n: 1 },
      { _id: { status: 'no-show', past: true }, n: 2 },
      { _id: { status: 'declined', past: true }, n: 1 },
      { _id: { status: 'cancelled', past: true }, n: 3 },
      { _id: { status: 'scheduled', past: true }, n: 2 },
      { _id: { status: 'requested', past: false }, n: 4 }, // today: not "never closed" yet
    ] as any);

    const body = await (await get('summary=1&status=completed&from=2026-11-01&to=2026-11-13T23:59:59.999Z')).json();
    expect(body.summary).toEqual({ done: 6, notSeen: 3, cancelled: 3, open: 2 });

    const pipeline = vi.mocked(Visit.aggregate).mock.calls[0][0] as any[];
    expect(pipeline[0].$match).not.toHaveProperty('status');
    expect(pipeline[0].$match.userId).toBe(USER);
    expect(pipeline[0].$match.date.$gte).toEqual(new Date('2026-11-01'));
    expect(pipeline[1].$group._id.past.$lt[1]).toEqual(new Date('2026-11-13T00:00:00.000Z'));
    // The list itself still filters by status.
    expect(vi.mocked(Visit.find).mock.calls[0][0]).toMatchObject({ status: 'completed' });
  });
});
