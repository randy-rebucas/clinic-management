import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { aggregate: vi.fn() } }));

import { Types } from 'mongoose';
import Visit from '@/models/MedicalRepresentativeVisit';
import { memberStats } from '@/lib/rep-team-stats';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** The $group stage the stats were computed with. */
function group() {
  const pipeline = vi.mocked(Visit.aggregate).mock.calls[0][0] as any[];
  return pipeline.find((s) => s.$group).$group;
}

describe('memberStats (team route counts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Visit.aggregate).mockResolvedValue([
      { _id: USER, visitsThisMonth: 4, completedThisMonth: 2, upcoming: 1, pendingRequests: 1, lastVisitAt: day('2026-11-10') },
    ] as any);
  });

  it('uses Manila days: 1 Dec 06:00 in Manila is already December and today is 1 Dec', async () => {
    // 30 Nov 22:00 UTC = 1 Dec 06:00 in Manila.
    await memberStats([USER], new Date('2026-11-30T22:00:00.000Z'));
    const g = group();
    const [monthFrom, monthTo] = g.visitsThisMonth.$sum.$cond[0].$and[0].$and;
    expect(monthFrom.$gte[1]).toEqual(day('2026-12-01'));
    expect(monthTo.$lt[1]).toEqual(day('2027-01-01'));
    expect(g.upcoming.$sum.$cond[0].$and[0].$gte[1]).toEqual(day('2026-12-01'));
  });

  it('counts a request as waiting only from today on, like Home', async () => {
    await memberStats([USER], new Date('2026-11-13T02:00:00.000Z'));
    const cond = group().pendingRequests.$sum.$cond[0].$and;
    expect(cond[0].$gte[1]).toEqual(day('2026-11-13'));
    expect(cond[1]).toEqual({ $eq: ['$status', 'requested'] });
  });

  it('keys the result by user id without the _id field', async () => {
    const stats = await memberStats([USER]);
    expect(stats.get(String(USER))).toMatchObject({ visitsThisMonth: 4, pendingRequests: 1 });
    expect((stats.get(String(USER)) as Record<string, unknown>)?._id).toBeUndefined();
  });
});
