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
  const q: any = { select: () => q, sort: () => q, skip: () => q, limit: () => q, lean: async () => value };
  return q;
};
vi.mock('@/models/Settings', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn(), countDocuments: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/RepAccessRequest', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { aggregate: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Visit from '@/models/MedicalRepresentativeVisit';
import { GET } from '@/app/api/medical-representatives/clinics/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const A = new Types.ObjectId('507f1f77bcf86cd7994390a1');
const B = new Types.ObjectId('507f1f77bcf86cd7994390b2');

describe('GET /api/medical-representatives/clinics visit history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T02:00:00.000Z')); // Fri 13 Nov, 10:00 Manila
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(MedicalRepresentative.findOne).mockReturnValue(chain({ tenantIds: [A] }) as any);
    vi.mocked(Settings.find).mockReturnValue(
      chain([
        { tenantId: A, repVisitSettings: { enabled: true } },
        { tenantId: B, repVisitSettings: { enabled: true, openToAllReps: true } },
      ]) as any
    );
    vi.mocked(Tenant.find).mockReturnValue(chain([{ _id: A, name: 'Alpha Clinic' }, { _id: B, name: 'Beta Clinic' }]) as any);
    vi.mocked(Tenant.countDocuments).mockResolvedValue(2 as any);
  });
  afterEach(() => vi.useRealTimers());

  it('adds lastVisit and nextVisit per clinic, null where the rep has none', async () => {
    vi.mocked(Visit.aggregate).mockResolvedValue([{ _id: A, lastDone: '2026-10-02', nextOpen: '2026-11-18 09:30' }] as any);

    const { data } = await (await GET(new NextRequest('http://x/api/medical-representatives/clinics'))).json();

    expect(data[0]).toMatchObject({ name: 'Alpha Clinic', lastVisit: '2026-10-02', nextVisit: { date: '2026-11-18', time: '09:30' } });
    expect(data[1]).toMatchObject({ name: 'Beta Clinic', lastVisit: null, nextVisit: null });
  });

  it('looks only at the rep’s own completed and open visits with the listed clinics, bookings or linked log entries', async () => {
    vi.mocked(Visit.aggregate).mockResolvedValue([] as any);
    await GET(new NextRequest('http://x/api/medical-representatives/clinics'));

    const [match, group] = vi.mocked(Visit.aggregate).mock.calls[0][0] as any[];
    expect(match.$match.userId).toBe(USER);
    expect(match.$match.status.$in).toEqual(['completed', 'requested', 'scheduled']);
    expect(match.$match.$or.map((o: any) => Object.keys(o)[0])).toEqual(['clinicId', 'linkedClinicId']);
    expect(match.$match.$or[0].clinicId.$in.map(String)).toEqual([String(A), String(B)]);
    // "Next" starts today (Manila), not at this instant.
    const nextCond = group.$group.nextOpen.$min.$cond[0].$and[1].$gte;
    expect(nextCond[1]).toEqual(new Date('2026-11-13T00:00:00.000Z'));
  });

  it('skips the history query when no clinic matches', async () => {
    vi.mocked(Tenant.find).mockReturnValue(chain([]) as any);
    vi.mocked(Tenant.countDocuments).mockResolvedValue(0 as any);
    await GET(new NextRequest('http://x/api/medical-representatives/clinics?search=zzz'));
    expect(Visit.aggregate).not.toHaveBeenCalled();
  });
});
