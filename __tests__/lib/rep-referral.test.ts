import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/RepReferralCode', () => ({
  REFERRAL_CODE_PATTERN: /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/,
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findById: vi.fn(), exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { updateOne: vi.fn(), find: vi.fn(), countDocuments: vi.fn() } }));

import RepReferralCode from '@/models/RepReferralCode';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Tenant from '@/models/Tenant';
import { lookupReferralCode, newRepCode, normalizeReferralCode, redeemReferralCode, referralLink } from '@/lib/rep-referral';

const CODE_ID = new Types.ObjectId();
const REP = new Types.ObjectId();
const TENANT = new Types.ObjectId();

function q(value: unknown) {
  const chain: any = {};
  for (const m of ['select', 'sort', 'limit']) chain[m] = vi.fn(() => chain);
  chain.lean = vi.fn(async () => value);
  return chain;
}

const codeDoc = (over: Record<string, unknown> = {}) => ({ _id: CODE_ID, code: 'REP-7K2PQX', repId: REP, status: 'active', uses: 0, ...over });
const activeRep = { firstName: 'Lance', lastName: 'Reyes', company: 'Unilab', status: 'active', isActivated: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(RepReferralCode.findOne).mockReturnValue(q(codeDoc()) as any);
  vi.mocked(MedicalRepresentative.findById).mockReturnValue(q(activeRep) as any);
});

describe('codes', () => {
  it('makes readable REP- codes without look-alike characters', () => {
    for (let i = 0; i < 50; i++) expect(newRepCode()).toMatch(/^REP-[A-HJKMNP-Z2-9]{6}$/);
  });
  it('normalizes what a clinic types', () => {
    expect(normalizeReferralCode(' rep-7k2pqx ')).toBe('REP-7K2PQX');
    expect(normalizeReferralCode('ab')).toBeNull();
    expect(normalizeReferralCode('bad code!')).toBeNull();
    expect(normalizeReferralCode(42)).toBeNull();
  });
  it('builds the signup link', () => {
    expect(referralLink('REP-7K2PQX')).toMatch(/\/tenant-onboard\?ref=REP-7K2PQX$/);
  });
});

describe('lookupReferralCode', () => {
  it('names the rep for a usable code', async () => {
    const r = await lookupReferralCode('rep-7k2pqx');
    expect(r).toMatchObject({ ok: true, code: 'REP-7K2PQX', rep: { name: 'Lance Reyes', company: 'Unilab' } });
  });
  it.each([
    ['disabled', codeDoc({ status: 'disabled' }), /isn’t valid/],
    ['expired', codeDoc({ expiresAt: new Date(Date.now() - 1000) }), /expired/],
    ['used up', codeDoc({ maxUses: 3, uses: 3 }), /used up/],
    ['unknown', null, /isn’t valid/],
  ])('refuses a %s code', async (_, doc, msg) => {
    vi.mocked(RepReferralCode.findOne).mockReturnValue(q(doc) as any);
    const r = await lookupReferralCode('REP-7K2PQX');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(msg);
  });
  it('refuses the code of a rep who is not activated', async () => {
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(q({ ...activeRep, isActivated: false }) as any);
    expect((await lookupReferralCode('REP-7K2PQX')).ok).toBe(false);
  });
});

describe('redeemReferralCode', () => {
  it('links the rep, counts the use and records the referrer once', async () => {
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue(null as any);
    vi.mocked(RepReferralCode.findOneAndUpdate).mockReturnValue(q({ _id: CODE_ID }) as any);
    const r = await redeemReferralCode(TENANT, 'REP-7K2PQX');
    expect(r).toMatchObject({ ok: true, alreadyLinked: false });
    expect(MedicalRepresentative.updateOne).toHaveBeenCalledWith({ _id: REP }, { $addToSet: { tenantIds: TENANT } });
    const [filter, update] = vi.mocked(Tenant.updateOne).mock.calls[0] as any[];
    expect(filter).toMatchObject({ _id: TENANT, 'referral.repId': { $exists: false } });
    expect(update.$set.referral).toMatchObject({ code: 'REP-7K2PQX', repId: REP });
  });
  it('does not count a rep the clinic already has', async () => {
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue({ _id: REP } as any);
    const r = await redeemReferralCode(TENANT, 'REP-7K2PQX');
    expect(r).toMatchObject({ ok: true, alreadyLinked: true });
    expect(RepReferralCode.findOneAndUpdate).not.toHaveBeenCalled();
    expect(MedicalRepresentative.updateOne).not.toHaveBeenCalled();
  });
  it('refuses when the last use was taken in the meantime', async () => {
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue(null as any);
    vi.mocked(RepReferralCode.findOneAndUpdate).mockReturnValue(q(null) as any);
    const r = await redeemReferralCode(TENANT, 'REP-7K2PQX');
    expect(r.ok).toBe(false);
    expect(MedicalRepresentative.updateOne).not.toHaveBeenCalled();
  });
});
