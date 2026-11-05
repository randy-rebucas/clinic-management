import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { distinct: vi.fn() } }));
vi.mock('@/models/Product', () => ({ default: { distinct: vi.fn() } }));
vi.mock('@/models/User', () => ({ default: { deleteMany: vi.fn() } }));

import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import User from '@/models/User';
import { cleanupUnpaidRepSignups } from '@/lib/automations/medrep-signup-cleanup';

function candidates(rows: unknown[]) {
  vi.mocked(MedicalRepresentative.find).mockReturnValue({
    select: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }),
  } as any);
}

describe('cleanupUnpaidRepSignups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MedicalRepresentativeVisit.distinct).mockResolvedValue([] as any);
    vi.mocked(Product.distinct).mockResolvedValue([] as any);
  });

  it('only looks at unpaid public signups older than 14 days', async () => {
    candidates([]);
    const now = new Date('2026-11-20T00:00:00Z');
    expect(await cleanupUnpaidRepSignups(now)).toEqual({ deleted: 0, kept: 0 });

    const filter = (vi.mocked(MedicalRepresentative.find).mock.calls[0] as any[])[0];
    expect(filter).toMatchObject({
      'tenantIds.0': { $exists: false },
      status: 'inactive',
      isActivated: false,
      paymentStatus: 'pending',
      paymentAmount: { $gt: 0 },
      teamId: null,
    });
    expect(filter.createdAt.$lt).toEqual(new Date('2026-11-06T00:00:00Z'));
    expect(MedicalRepresentative.deleteMany).not.toHaveBeenCalled();
  });

  it('removes the signup and the login made for it', async () => {
    candidates([{ _id: 'r1', userId: 'u1' }]);
    expect(await cleanupUnpaidRepSignups()).toEqual({ deleted: 1, kept: 0 });
    expect(User.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['u1'] }, medicalRepresentativeProfile: { $in: ['r1'] } });
    expect(MedicalRepresentative.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['r1'] } });
  });

  it('keeps a signup with linked visits or products', async () => {
    candidates([{ _id: 'r1', userId: 'u1' }, { _id: 'r2', userId: 'u2' }, { _id: 'r3', userId: 'u3' }]);
    vi.mocked(MedicalRepresentativeVisit.distinct).mockResolvedValue(['r1'] as any);
    vi.mocked(Product.distinct).mockResolvedValue(['r2'] as any);

    expect(await cleanupUnpaidRepSignups()).toEqual({ deleted: 1, kept: 2 });
    expect(MedicalRepresentative.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['r3'] } });
  });
});
