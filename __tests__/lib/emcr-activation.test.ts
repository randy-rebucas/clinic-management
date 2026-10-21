import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/ActivationCode', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), insertMany: vi.fn(), find: vi.fn() },
}));
vi.mock('@/models/VoucherBatch', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), findOne: vi.fn() } }));
vi.mock('@/lib/emcr/account', () => ({ findAccountForSession: vi.fn() }));

import { Types } from 'mongoose';
import ActivationCode from '@/models/ActivationCode';
import VoucherBatch from '@/models/VoucherBatch';
import EmcrAccount from '@/models/EmcrAccount';
import { findAccountForSession } from '@/lib/emcr/account';
import {
  activationView,
  extendedExpiry,
  formatActivationCode,
  generateActivationCode,
  hashActivationCode,
  normalizeActivationCode,
  redeemActivationCode,
  requireActiveEmcr,
  forgetActivationCache,
} from '@/lib/emcr/activation';

const ACCOUNT = new Types.ObjectId('507f1f77bcf86cd799439011');
const CODE_ID = new Types.ObjectId('507f1f77bcf86cd799439022');
const BATCH_ID = new Types.ObjectId('507f1f77bcf86cd799439033');
const TENANT = new Types.ObjectId('507f1f77bcf86cd799439044');
const NOW = new Date('2026-10-21T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const query = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

describe('voucher codes', () => {
  it('generates 12 characters with no look-alikes, printed in groups of four', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateActivationCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
      expect(normalizeActivationCode(formatActivationCode(code))).toBe(code);
    }
    expect(formatActivationCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });

  it('accepts what people type: lowercase, spaces, dashes', () => {
    expect(normalizeActivationCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
  });

  it('refuses anything that can never be a code', () => {
    expect(normalizeActivationCode('ABCD-EFGH-JKM')).toBeNull(); // too short
    expect(normalizeActivationCode('ABCD-EFGH-JKM0')).toBeNull(); // 0 is never used
    expect(normalizeActivationCode('ABCD-EFGH-JKMI')).toBeNull(); // I is never used
    expect(normalizeActivationCode(42)).toBeNull();
  });

  it('hashes with a key, so the stored hash is not a plain SHA-256 of the code', () => {
    const hash = hashActivationCode('ABCDEFGHJKMN');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashActivationCode('ABCDEFGHJKMN'));
    expect(hash).not.toBe(hashActivationCode('ABCDEFGHJKMP'));
  });
});

describe('expiry', () => {
  it('starts a year from today when nothing is running', () => {
    expect(extendedExpiry(null, 365, NOW).toISOString()).toBe(new Date(NOW.getTime() + 365 * DAY).toISOString());
    const lapsed = new Date(NOW.getTime() - 10 * DAY);
    expect(extendedExpiry(lapsed, 365, NOW).getTime()).toBe(NOW.getTime() + 365 * DAY);
  });

  it('stacks a renewal on the current year', () => {
    const running = new Date(NOW.getTime() + 20 * DAY);
    expect(extendedExpiry(running, 365, NOW).getTime()).toBe(running.getTime() + 365 * DAY);
  });

  it('reports days left and whether it is active', () => {
    const view = activationView({ activation: { plan: 'basic', expiresAt: new Date(NOW.getTime() + 30 * DAY) } }, NOW);
    expect(view).toMatchObject({ active: true, plan: 'basic', daysLeft: 30 });
    expect(activationView({ activation: { expiresAt: new Date(NOW.getTime() - DAY) } }, NOW)).toMatchObject({ active: false, plan: null, daysLeft: 0 });
    expect(activationView(null, NOW).active).toBe(false);
  });
});

describe('redeemActivationCode', () => {
  beforeEach(() => vi.clearAllMocks());

  function codeRow(status: string) {
    vi.mocked(ActivationCode.findOne).mockReturnValue(query({ _id: CODE_ID, batchId: BATCH_ID, tenantId: TENANT, status }) as any);
  }
  function batch(status: string) {
    vi.mocked(VoucherBatch.findById).mockReturnValue(query({ _id: BATCH_ID, status, plan: 'basic', days: 365, clinicName: 'Clinic A' }) as any);
  }

  it('refuses a malformed or unknown code without touching the database for the account', async () => {
    expect(await redeemActivationCode(ACCOUNT, 'nope', NOW)).toEqual({ ok: false, reason: 'invalid' });
    vi.mocked(ActivationCode.findOne).mockReturnValue(query(null) as any);
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(EmcrAccount.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses codes from a batch the clinic has not paid for yet', async () => {
    codeRow('unsold');
    batch('unpaid');
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'not_paid' });
    expect(ActivationCode.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses void codes and codes of a void batch', async () => {
    codeRow('void');
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'invalid' });
    codeRow('unsold');
    batch('void');
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('says "used" for a redeemed code, and when a parallel redemption won the claim', async () => {
    codeRow('redeemed');
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'used' });

    codeRow('unsold');
    batch('paid');
    vi.mocked(ActivationCode.findOneAndUpdate).mockResolvedValue(null as any);
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'used' });
    expect(EmcrAccount.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('claims the code only while unsold, then extends the account inside the update', async () => {
    codeRow('unsold');
    batch('paid');
    vi.mocked(ActivationCode.findOneAndUpdate).mockResolvedValue({ _id: CODE_ID } as any);
    const expiresAt = new Date(NOW.getTime() + 365 * DAY);
    vi.mocked(EmcrAccount.findOneAndUpdate).mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: ACCOUNT, activation: { plan: 'basic', expiresAt } }) } as any);

    const result = await redeemActivationCode(ACCOUNT, 'abcd efgh jkmn', NOW);
    expect(result).toEqual({ ok: true, expiresAt, plan: 'basic', clinicName: 'Clinic A' });

    const [filter, update] = vi.mocked(ActivationCode.findOneAndUpdate).mock.calls[0] as any[];
    expect(filter).toEqual({ _id: CODE_ID, status: 'unsold' });
    expect(update.$set).toMatchObject({ status: 'redeemed', redeemedBy: ACCOUNT });

    // A pipeline update: the new expiry is computed from the stored one, so two codes redeemed
    // at the same moment both count.
    const pipeline = (vi.mocked(EmcrAccount.findOneAndUpdate).mock.calls[0] as any[])[1];
    expect(Array.isArray(pipeline)).toBe(true);
    expect(JSON.stringify(pipeline[0].$set.activation.expiresAt)).toContain('$activation.expiresAt');
  });

  it('gives the code back when the account disappeared', async () => {
    codeRow('unsold');
    batch('paid');
    vi.mocked(ActivationCode.findOneAndUpdate).mockResolvedValue({ _id: CODE_ID } as any);
    vi.mocked(EmcrAccount.findOneAndUpdate).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    expect(await redeemActivationCode(ACCOUNT, 'ABCD-EFGH-JKMN', NOW)).toEqual({ ok: false, reason: 'invalid' });
    expect(ActivationCode.updateOne).toHaveBeenCalledWith(
      { _id: CODE_ID, redeemedBy: ACCOUNT },
      expect.objectContaining({ $set: { status: 'unsold' } })
    );
  });
});

describe('requireActiveEmcr', () => {
  const session = { patientId: '507f1f77bcf86cd799439055', acc: String(ACCOUNT) };
  const original = process.env.EMCR_ACTIVATION_ENFORCED;

  beforeEach(() => {
    vi.clearAllMocks();
    forgetActivationCache();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.EMCR_ACTIVATION_ENFORCED;
    else process.env.EMCR_ACTIVATION_ENFORCED = original;
  });

  it('lets everything through until the gate is switched on', async () => {
    delete process.env.EMCR_ACTIVATION_ENFORCED;
    expect(await requireActiveEmcr(session, 'booking')).toBeNull();
    expect(findAccountForSession).not.toHaveBeenCalled();
  });

  it('answers 402 ACTIVATION_REQUIRED without an active year', async () => {
    process.env.EMCR_ACTIVATION_ENFORCED = 'true';
    vi.mocked(findAccountForSession).mockResolvedValue({ _id: ACCOUNT, activation: { expiresAt: new Date(Date.now() - DAY) } } as any);
    const response = await requireActiveEmcr(session, 'booking');
    expect(response?.status).toBe(402);
    expect(await response?.json()).toMatchObject({ code: 'ACTIVATION_REQUIRED' });
  });

  it('allows an active account', async () => {
    process.env.EMCR_ACTIVATION_ENFORCED = 'true';
    vi.mocked(findAccountForSession).mockResolvedValue({ _id: ACCOUNT, activation: { plan: 'basic', expiresAt: new Date(Date.now() + DAY) } } as any);
    expect(await requireActiveEmcr(session, 'check_in')).toBeNull();
  });
});
