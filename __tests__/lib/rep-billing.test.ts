import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/platform-config', () => ({ getPlatformFees: vi.fn(), getPlanPricing: vi.fn() }));
vi.mock('@/lib/paymongo', () => ({ createCheckoutSession: vi.fn(), isPayMongoConfigured: vi.fn() }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findById: vi.fn(), updateOne: vi.fn(), countDocuments: vi.fn() } }));
vi.mock('@/models/RepTeam', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));

import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepTeam from '@/models/RepTeam';
import { getPlatformFees } from '@/lib/platform-config';
import { applyRepSubscriptionPayment, applyTeamPayment, convertRemaining, hasActivePro, repBookingAccess, repPeriodEnd } from '@/lib/rep-billing';

const NOW = new Date('2026-11-01T00:00:00Z');
const REP = '507f1f77bcf86cd7994390aa';
const TEAM = '507f1f77bcf86cd7994390bb';
const fees = (monthly: number, pro = 0) =>
  vi.mocked(getPlatformFees).mockResolvedValue({
    medrepActivationFee: 0,
    medrepMonthlyFee: monthly,
    medrepSeatMonthlyFee: 400,
    medrepProMonthlyFee: pro,
    repAiFreeActions: 20,
    repAiProActions: 300,
    voucherFaceValue: 80,
    voucherWholesalePrice: 60,
  });
const lean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

describe('repPeriodEnd', () => {
  it('adds a cycle after the later of now and the current end', () => {
    expect(repPeriodEnd(null, 'monthly', NOW).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(repPeriodEnd(new Date('2026-11-15T00:00:00Z'), 'monthly', NOW).toISOString()).toBe('2026-12-15T00:00:00.000Z');
    expect(repPeriodEnd(new Date('2026-10-01T00:00:00Z'), 'yearly', NOW).toISOString()).toBe('2027-11-01T00:00:00.000Z');
  });
});

describe('repBookingAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is free for everyone while the rep fee is 0', async () => {
    fees(0);
    expect(await repBookingAccess({}, NOW)).toEqual({ ok: true, via: 'free' });
  });

  it('uses the rep’s own subscription while it runs', async () => {
    fees(399);
    expect(await repBookingAccess({ subscription: { expiresAt: new Date('2026-11-20') } }, NOW)).toEqual({ ok: true, via: 'individual' });
    expect(await repBookingAccess({ subscription: { expiresAt: new Date('2026-10-20') } }, NOW)).toEqual({ ok: false });
  });

  it('uses the team plan only while the team fits its seats', async () => {
    fees(399);
    vi.mocked(RepTeam.findById).mockReturnValue(lean({ subscription: { seats: 3, expiresAt: new Date('2026-12-01') } }) as any);
    vi.mocked(MedicalRepresentative.countDocuments).mockResolvedValueOnce(3 as any);
    expect(await repBookingAccess({ teamId: TEAM }, NOW)).toEqual({ ok: true, via: 'team' });
    vi.mocked(MedicalRepresentative.countDocuments).mockResolvedValueOnce(4 as any);
    expect(await repBookingAccess({ teamId: TEAM }, NOW)).toEqual({ ok: false });
  });
});

describe('applying payments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('extends a rep subscription once per payment', async () => {
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(lean({ _id: REP, subscription: { expiresAt: new Date('2026-11-10T00:00:00Z') } }) as any);
    vi.mocked(MedicalRepresentative.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    const r = await applyRepSubscriptionPayment({ repId: REP, billingCycle: 'monthly', amount: '399' }, 399, 'pay_1', NOW);
    expect(r).toEqual({ ok: true, applied: true });
    const [, update] = vi.mocked(MedicalRepresentative.updateOne).mock.calls[0] as any;
    expect(update.$set['subscription.expiresAt'].toISOString()).toBe('2026-12-10T00:00:00.000Z');

    vi.mocked(MedicalRepresentative.findById).mockReturnValue(lean({ _id: REP, subscription: { paymentHistory: [{ paymentId: 'pay_1' }] } }) as any);
    expect(await applyRepSubscriptionPayment({ repId: REP, amount: '399' }, 399, 'pay_1', NOW)).toEqual({ ok: true, applied: false });
  });

  it('refuses an underpaid checkout', async () => {
    const r = await applyRepSubscriptionPayment({ repId: REP, amount: '399' }, 100, 'pay_2', NOW);
    expect(r.ok).toBe(false);
    expect(MedicalRepresentative.updateOne).not.toHaveBeenCalled();
  });

  it('sets the team’s seats from the payment', async () => {
    vi.mocked(RepTeam.findById).mockReturnValue(lean({ _id: TEAM, subscription: {} }) as any);
    vi.mocked(RepTeam.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    expect(await applyTeamPayment({ teamId: TEAM, seats: '5', billingCycle: 'yearly', amount: '20000' }, 20000, 'pay_3', NOW)).toEqual({ ok: true, applied: true });
    const [, update] = vi.mocked(RepTeam.updateOne).mock.calls[0] as any;
    expect(update.$set['subscription.seats']).toBe(5);
    expect(update.$set['subscription.expiresAt'].toISOString()).toBe('2027-11-01T00:00:00.000Z');
  });
});

const DAY = 24 * 60 * 60 * 1000;

describe('Pro plan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('converts time left at the two monthly prices', () => {
    expect(convertRemaining(16 * DAY, 500, 800)).toBe(10 * DAY);
    expect(convertRemaining(10 * DAY, 800, 500)).toBe(16 * DAY);
    expect(convertRemaining(10 * DAY, 0, 800)).toBe(0); // free time has no value to carry
    expect(convertRemaining(-DAY, 500, 800)).toBe(0);
  });

  it('is active only on a running Pro plan', () => {
    expect(hasActivePro({ subscription: { plan: 'pro', expiresAt: new Date('2026-11-20') } }, NOW)).toBe(true);
    expect(hasActivePro({ subscription: { plan: 'pro', expiresAt: new Date('2026-10-20') } }, NOW)).toBe(false);
    expect(hasActivePro({ subscription: { plan: 'standard', expiresAt: new Date('2026-11-20') } }, NOW)).toBe(false);
    expect(hasActivePro({}, NOW)).toBe(false);
  });

  it('upgrading converts the standard time left, then adds the Pro month', async () => {
    fees(500, 800);
    // 16 days of standard left → 10 days of Pro, then one month.
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(lean({ _id: REP, subscription: { plan: 'standard', expiresAt: new Date('2026-11-17T00:00:00Z') } }) as any);
    vi.mocked(MedicalRepresentative.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    await applyRepSubscriptionPayment({ repId: REP, billingCycle: 'monthly', plan: 'pro', amount: '800' }, 800, 'pay_pro', NOW);
    const [, update] = vi.mocked(MedicalRepresentative.updateOne).mock.calls[0] as any;
    expect(update.$set['subscription.plan']).toBe('pro');
    expect(update.$set['subscription.expiresAt'].toISOString()).toBe('2026-12-11T00:00:00.000Z');
    expect(update.$push['subscription.paymentHistory'].plan).toBe('pro');
  });

  it('renewing the same plan just extends it, without reading prices', async () => {
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(lean({ _id: REP, subscription: { plan: 'pro', expiresAt: new Date('2026-11-10T00:00:00Z') } }) as any);
    vi.mocked(MedicalRepresentative.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    await applyRepSubscriptionPayment({ repId: REP, billingCycle: 'monthly', plan: 'pro', amount: '800' }, 800, 'pay_pro2', NOW);
    const [, update] = vi.mocked(MedicalRepresentative.updateOne).mock.calls[0] as any;
    expect(update.$set['subscription.expiresAt'].toISOString()).toBe('2026-12-10T00:00:00.000Z');
    expect(getPlatformFees).not.toHaveBeenCalled();
  });

  it('a payment without a plan is standard (checkouts made before Pro)', async () => {
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(lean({ _id: REP, subscription: {} }) as any);
    vi.mocked(MedicalRepresentative.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    await applyRepSubscriptionPayment({ repId: REP, billingCycle: 'monthly', amount: '500' }, 500, 'pay_old', NOW);
    const [, update] = vi.mocked(MedicalRepresentative.updateOne).mock.calls[0] as any;
    expect(update.$set['subscription.plan']).toBe('standard');
  });
});
