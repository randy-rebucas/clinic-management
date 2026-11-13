import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/RepReferralCode', () => ({
  REFERRAL_CODE_PATTERN: /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/,
  default: { findOne: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn(), countDocuments: vi.fn() } }));

import RepReferralCode from '@/models/RepReferralCode';
import Tenant from '@/models/Tenant';
import { repReferralView } from '@/lib/rep-referral';

const REP = new Types.ObjectId();

describe('repReferralView: referred clinics', () => {
  let chain: any;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(RepReferralCode.findOne).mockReturnValue({ lean: async () => ({ code: 'REP-7K2PQX', repId: REP }) } as any);
    chain = { select: vi.fn(() => chain), sort: vi.fn(() => chain), limit: vi.fn(() => chain), lean: vi.fn(async () => [
      { name: 'Late Joiner', referral: { at: new Date('2026-11-10T00:00:00Z') } },
    ]) };
    vi.mocked(Tenant.find).mockReturnValue(chain);
    vi.mocked(Tenant.countDocuments).mockResolvedValue(1 as any);
  });

  it('lists newest referral first (joinedOn = referral.at), not by when the clinic signed up', async () => {
    const view = await repReferralView(REP);
    expect(chain.sort).toHaveBeenCalledWith({ 'referral.at': -1, createdAt: -1 });
    expect(view.clinics).toEqual([{ name: 'Late Joiner', joinedOn: '2026-11-10T00:00:00.000Z' }]);
  });
});
