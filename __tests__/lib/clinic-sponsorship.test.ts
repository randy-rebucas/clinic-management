import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyStaff: vi.fn(async () => ({ recipients: 1, batchId: 'b' })) }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToUserDevices: vi.fn(async () => ({ sent: true })) }));
vi.mock('@/lib/platform-config', () => ({ getSponsorshipPricing: vi.fn() }));
vi.mock('@/lib/paymongo', () => ({ createCheckoutSession: vi.fn(), isPayMongoConfigured: vi.fn() }));
vi.mock('@/lib/subscription', () => ({ activateSubscriptionFromOrder: vi.fn() }));
vi.mock('@/models/ClinicSponsorship', () => ({
  OPEN_SPONSORSHIP_STATUSES: ['pending', 'accepted'],
  default: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), findById: vi.fn(), updateOne: vi.fn(), exists: vi.fn(), find: vi.fn() },
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn(), findById: vi.fn(), find: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/SubscriptionOrder', () => ({ default: { create: vi.fn(), updateOne: vi.fn() } }));

import ClinicSponsorship from '@/models/ClinicSponsorship';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Tenant from '@/models/Tenant';
import SubscriptionOrder from '@/models/SubscriptionOrder';
import { getSponsorshipPricing } from '@/lib/platform-config';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { activateSubscriptionFromOrder } from '@/lib/subscription';
import { DEFAULT_SPONSORSHIP_PRICING } from '@/lib/sponsorship-pricing';
import {
  applySponsorshipPayment,
  createSponsorshipCheckout,
  endSponsorship,
  requestSponsorship,
  respondToSponsorship,
} from '@/lib/clinic-sponsorship';

const TENANT = new Types.ObjectId();
const REP = new Types.ObjectId();
const REP_USER = new Types.ObjectId();
const CLINIC_USER = new Types.ObjectId();
const SPONSORSHIP = new Types.ObjectId();

/** A mongoose query that resolves to `value` through .select / .sort / .limit / .lean. */
function q(value: unknown) {
  const chain: any = {};
  for (const m of ['select', 'sort', 'limit']) chain[m] = vi.fn(() => chain);
  chain.lean = vi.fn(async () => value);
  chain.then = (res: any, rej: any) => Promise.resolve(value).then(res, rej);
  return chain;
}

const rep = (over: Record<string, unknown> = {}) => ({
  _id: REP,
  userId: REP_USER,
  tenantIds: [TENANT],
  isActivated: true,
  status: 'active',
  firstName: 'Ana',
  lastName: 'Cruz',
  company: 'Pharma Co',
  email: 'ana@example.com',
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  _id: SPONSORSHIP,
  tenantId: TENANT,
  repId: REP,
  repUserId: REP_USER,
  initiatedBy: 'clinic',
  status: 'pending',
  payments: [],
  createdAt: new Date('2026-11-01'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Tenant.find).mockReturnValue(q([{ _id: TENANT, name: 'My Clinic' }]) as any);
  vi.mocked(MedicalRepresentative.find).mockReturnValue(q([rep()]) as any);
  vi.mocked(MedicalRepresentative.findById).mockReturnValue(q(rep()) as any);
  vi.mocked(getSponsorshipPricing).mockResolvedValue(DEFAULT_SPONSORSHIP_PRICING);
  vi.mocked(isPayMongoConfigured).mockResolvedValue(true);
});

describe('requestSponsorship', () => {
  beforeEach(() => {
    vi.mocked(Tenant.findOne).mockReturnValue(q({ _id: TENANT, name: 'My Clinic' }) as any);
  });

  it('lets a clinic ask a linked, active rep', async () => {
    vi.mocked(ClinicSponsorship.create).mockResolvedValue({ toObject: () => row(), message: undefined } as any);
    const r = await requestSponsorship({ tenantId: String(TENANT), repId: String(REP), by: 'clinic', userId: String(CLINIC_USER) });
    expect(r).toMatchObject({ ok: true, data: { status: 'pending', initiatedBy: 'clinic', awaitingYou: false, clinic: { name: 'My Clinic' } } });
    expect(vi.mocked(ClinicSponsorship.create).mock.calls[0][0]).toMatchObject({ tenantId: TENANT, repId: REP, repUserId: REP_USER, initiatedBy: 'clinic' });
  });

  it('refuses a rep who is not linked to the clinic, or inactive', async () => {
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(q(rep({ tenantIds: [new Types.ObjectId()] })) as any);
    expect(await requestSponsorship({ tenantId: String(TENANT), repId: String(REP), by: 'rep', userId: String(REP_USER) })).toMatchObject({
      ok: false,
      status: 409,
      code: 'NOT_LINKED',
    });
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(q(rep({ isActivated: false })) as any);
    expect(await requestSponsorship({ tenantId: String(TENANT), repId: String(REP), by: 'clinic', userId: String(CLINIC_USER) })).toMatchObject({
      code: 'REP_INACTIVE',
    });
    expect(ClinicSponsorship.create).not.toHaveBeenCalled();
  });

  it('a rep can only offer as themselves', async () => {
    const r = await requestSponsorship({ tenantId: String(TENANT), repId: String(REP), by: 'rep', userId: String(new Types.ObjectId()) });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it('one open sponsorship per clinic (the unique index) comes back as a 409', async () => {
    vi.mocked(ClinicSponsorship.create).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const r = await requestSponsorship({ tenantId: String(TENANT), repId: String(REP), by: 'clinic', userId: String(CLINIC_USER) });
    expect(r).toMatchObject({ ok: false, status: 409, code: 'ALREADY_OPEN' });
  });
});

describe('answering and ending', () => {
  it('only the side that did not ask can accept, scoped to its own records', async () => {
    vi.mocked(ClinicSponsorship.findOneAndUpdate).mockReturnValue(q(row({ status: 'accepted' })) as any);
    const r = await respondToSponsorship(String(SPONSORSHIP), { side: 'rep', userId: String(REP_USER) }, 'accept');
    expect(r).toMatchObject({ ok: true, data: { status: 'accepted' } });
    expect(vi.mocked(ClinicSponsorship.findOneAndUpdate).mock.calls[0][0]).toMatchObject({
      _id: SPONSORSHIP,
      repUserId: REP_USER,
      status: 'pending',
      initiatedBy: { $ne: 'rep' },
    });
  });

  it('answering your own request is a conflict, not a change', async () => {
    vi.mocked(ClinicSponsorship.findOneAndUpdate).mockReturnValue(q(null) as any);
    vi.mocked(ClinicSponsorship.exists).mockResolvedValue({ _id: SPONSORSHIP } as any);
    const r = await respondToSponsorship(String(SPONSORSHIP), { side: 'clinic', tenantId: String(TENANT), userId: String(CLINIC_USER) }, 'accept');
    expect(r).toMatchObject({ ok: false, status: 409 });
  });

  it('cancelling a pending one withdraws it; an accepted one ends', async () => {
    const actor = { side: 'clinic' as const, tenantId: String(TENANT), userId: String(CLINIC_USER) };
    vi.mocked(ClinicSponsorship.findOne).mockReturnValue(q({ status: 'accepted' }) as any);
    vi.mocked(ClinicSponsorship.findOneAndUpdate).mockReturnValue(q(row({ status: 'ended', endedBy: 'clinic' })) as any);
    expect(await endSponsorship(String(SPONSORSHIP), actor)).toMatchObject({ ok: true, data: { status: 'ended', endedBy: 'clinic' } });
    expect(vi.mocked(ClinicSponsorship.findOneAndUpdate).mock.calls[0][1]).toMatchObject({ $set: { status: 'ended', endedBy: 'clinic' } });
    // The plan stops naming this rep as its sponsor.
    expect(Tenant.updateOne).toHaveBeenCalledWith({ _id: TENANT, 'subscription.sponsor.sponsorshipId': SPONSORSHIP }, { $unset: { 'subscription.sponsor': 1 } });

    vi.mocked(ClinicSponsorship.findOne).mockReturnValue(q({ status: 'declined' }) as any);
    expect(await endSponsorship(String(SPONSORSHIP), actor)).toMatchObject({ ok: false, code: 'CLOSED' });
  });
});

describe('createSponsorshipCheckout', () => {
  beforeEach(() => {
    vi.mocked(Tenant.findById).mockReturnValue(q({ _id: TENANT, name: 'My Clinic' }) as any);
    vi.mocked(createCheckoutSession).mockResolvedValue({ id: 'cs_1', checkoutUrl: 'https://pay/cs_1', status: 'active', payments: [], metadata: {} } as any);
  });

  it('charges the discounted term and records an order for Professional', async () => {
    vi.mocked(ClinicSponsorship.findOne).mockReturnValue(q(row({ status: 'accepted' })) as any);
    const r = await createSponsorshipCheckout(String(SPONSORSHIP), String(REP_USER), 6);
    expect(r).toMatchObject({ ok: true, data: { checkoutUrl: 'https://pay/cs_1', amount: 13500, months: 6 } });
    const opts = vi.mocked(createCheckoutSession).mock.calls[0][0];
    expect(opts.amount).toBe(13500);
    expect(opts.email).toBe('ana@example.com');
    expect(opts.metadata).toMatchObject({ purpose: 'clinic-sponsorship', tenantId: String(TENANT), sponsorshipId: String(SPONSORSHIP), months: '6', amount: '13500' });
    expect(vi.mocked(SubscriptionOrder.create).mock.calls[0][0]).toMatchObject({
      plan: 'professional',
      months: 6,
      billingCycle: 'monthly',
      sponsorshipId: SPONSORSHIP,
      amount: 13500,
    });
  });

  it('refuses an odd term, a sponsorship not yet accepted, or no payment gateway', async () => {
    expect(await createSponsorshipCheckout(String(SPONSORSHIP), String(REP_USER), 2)).toMatchObject({ code: 'BAD_TERM' });
    vi.mocked(ClinicSponsorship.findOne).mockReturnValue(q(row({ status: 'pending' })) as any);
    expect(await createSponsorshipCheckout(String(SPONSORSHIP), String(REP_USER), 3)).toMatchObject({ code: 'NOT_ACCEPTED' });
    vi.mocked(ClinicSponsorship.findOne).mockReturnValue(q(row({ status: 'accepted' })) as any);
    vi.mocked(isPayMongoConfigured).mockResolvedValue(false);
    expect(await createSponsorshipCheckout(String(SPONSORSHIP), String(REP_USER), 3)).toMatchObject({ status: 503 });
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it('only the sponsoring rep finds it', async () => {
    vi.mocked(ClinicSponsorship.findOne).mockReturnValue(q(null) as any);
    expect(await createSponsorshipCheckout(String(SPONSORSHIP), String(new Types.ObjectId()), 1)).toMatchObject({ status: 404 });
  });
});

describe('applySponsorshipPayment', () => {
  const meta = { purpose: 'clinic-sponsorship', orderId: 'pm_s', tenantId: String(TENANT), sponsorshipId: String(SPONSORSHIP), repId: String(REP), months: '3', amount: '7125' };

  it('extends the clinic through the subscription path and records the payment once', async () => {
    const paidThrough = new Date('2027-02-12');
    vi.mocked(activateSubscriptionFromOrder).mockResolvedValue({ ok: true, alreadyApplied: false, subscription: { expiresAt: paidThrough } });
    vi.mocked(ClinicSponsorship.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    vi.mocked(ClinicSponsorship.findById).mockReturnValue(q(row({ status: 'accepted', paidThrough })) as any);

    expect(await applySponsorshipPayment(meta, 7125, 'pay_1', 'cs_1')).toEqual({ ok: true, applied: true });
    expect((vi.mocked(SubscriptionOrder.updateOne).mock.calls[0] as unknown[])[1]).toMatchObject({
      $setOnInsert: { plan: 'professional', months: 3, sponsorshipId: SPONSORSHIP, amount: 7125 },
    });
    expect(activateSubscriptionFromOrder).toHaveBeenCalledWith('pm_s', { transactionId: 'pay_1', amount: 7125, currency: 'PHP' });
    const [filter, update] = vi.mocked(ClinicSponsorship.updateOne).mock.calls[0] as unknown[];
    expect(filter).toMatchObject({ 'payments.orderId': { $ne: 'pm_s' } });
    expect(update).toMatchObject({ $push: { payments: { orderId: 'pm_s', months: 3, amount: 7125 } }, $set: { paidThrough } });
  });

  it('a repeat notice applies nothing new', async () => {
    vi.mocked(activateSubscriptionFromOrder).mockResolvedValue({ ok: true, alreadyApplied: true, subscription: {} });
    vi.mocked(ClinicSponsorship.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    expect(await applySponsorshipPayment(meta, 7125, 'pay_1', 'cs_1')).toEqual({ ok: true, applied: false });
  });

  it('a busy activation is retried; bad metadata is not', async () => {
    vi.mocked(activateSubscriptionFromOrder).mockResolvedValue({ ok: false, status: 409, error: 'retry' });
    expect(await applySponsorshipPayment(meta, 7125, 'pay_1', 'cs_1')).toEqual({ ok: false, retry: true, error: 'retry' });
    expect(await applySponsorshipPayment({ ...meta, months: '2' }, 7125, 'pay_1', 'cs_1')).toMatchObject({ ok: false, retry: false });
  });
});
