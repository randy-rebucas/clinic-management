import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/platform-config', () => ({ getPlanPricing: vi.fn() }));
vi.mock('@/lib/platform-invoice', () => ({ cancelSubscriptionInvoice: vi.fn(async () => {}) }));
vi.mock('@/models/SubscriptionOrder', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn() } }));
const sponsorPaidThrough = vi.hoisted(() => ({ value: null as Date | null }));
vi.mock('@/models/ClinicSponsorship', () => ({
  default: {
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    findById: vi.fn(() => ({ select: () => ({ lean: async () => ({ paidThrough: sponsorPaidThrough.value }) }) })),
  },
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: {} }));

import Tenant from '@/models/Tenant';
import ClinicSponsorship from '@/models/ClinicSponsorship';
import { reverseSubscriptionPayment } from '@/lib/subscription';

function tenantWith(expiresAt: Date, payment: Record<string, unknown>, current = 'ORDER-2') {
  const doc: any = {
    _id: 't1',
    subscription: { status: 'active', expiresAt, paypalOrderId: current, paymentHistory: [payment] },
    save: vi.fn(),
  };
  vi.mocked(Tenant.findOne).mockResolvedValue(doc);
  return doc;
}

describe('reverseSubscriptionPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a chargeback takes the period back and cancels when nothing paid is left', async () => {
    const end = new Date(Date.now() + 20 * 86_400_000);
    const doc = tenantWith(end, { transactionId: 'CAP-2', orderId: 'ORDER-2', amount: 100, billingCycle: 'monthly', status: 'completed' });
    expect(await reverseSubscriptionPayment({ transactionId: 'CAP-2' }, 'full')).toMatchObject({ reversed: true });
    expect(doc.subscription.paymentHistory[0].status).toBe('refunded');
    expect(doc.subscription.status).toBe('cancelled');
    expect(doc.save).toHaveBeenCalled();
  });

  it('an earlier stacked payment comes off the end and the plan stays active', async () => {
    const end = new Date(Date.now() + 400 * 86_400_000);
    const doc = tenantWith(end, { transactionId: 'CAP-1', orderId: 'ORDER-1', amount: 1000, billingCycle: 'yearly', status: 'completed' });
    await reverseSubscriptionPayment({ transactionId: 'CAP-1' }, 1000);
    expect(doc.subscription.status).toBe('active');
    expect(Math.round((doc.subscription.expiresAt.getTime() - end.getTime()) / 86_400_000)).toBeLessThan(-360);
  });

  it('a partial refund or a second notice changes nothing', async () => {
    const end = new Date(Date.now() + 20 * 86_400_000);
    const doc = tenantWith(end, { transactionId: 'CAP-2', orderId: 'ORDER-2', amount: 100, billingCycle: 'monthly', status: 'completed' });
    expect((await reverseSubscriptionPayment({ transactionId: 'CAP-2' }, 40)).reversed).toBe(false);
    doc.subscription.paymentHistory[0].status = 'refunded';
    expect((await reverseSubscriptionPayment({ transactionId: 'CAP-2' }, 'full')).reversed).toBe(false);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('a refunded sponsorship takes back the months it bought', async () => {
    const end = new Date(Date.now() + 200 * 86_400_000);
    const doc = tenantWith(end, { transactionId: 'CAP-S', orderId: 'ORDER-S', amount: 13500, billingCycle: 'monthly', months: 6, status: 'completed' }, 'ORDER-X');
    await reverseSubscriptionPayment({ transactionId: 'CAP-S' }, 'full');
    const days = Math.round((end.getTime() - doc.subscription.expiresAt.getTime()) / 86_400_000);
    expect(days).toBeGreaterThanOrEqual(181);
    expect(days).toBeLessThanOrEqual(184);
    expect(doc.subscription.status).toBe('active');
  });

  it('a refunded sponsorship payment is marked on the sponsorship, which keeps the plan’s new end', async () => {
    const end = new Date(Date.now() + 200 * 86_400_000);
    sponsorPaidThrough.value = new Date(end.getTime() - 30 * 86_400_000); // the clinic paid its own month after the sponsor
    const doc = tenantWith(end, { transactionId: 'CAP-T', orderId: 'ORDER-T', amount: 7125, months: 3, sponsorshipId: 'sp1', status: 'completed' }, 'ORDER-X');
    await reverseSubscriptionPayment({ transactionId: 'CAP-T' }, 'full');
    const [filter, update] = vi.mocked(ClinicSponsorship.updateOne).mock.calls[0] as any[];
    expect(filter).toMatchObject({ _id: 'sp1', payments: { $elemMatch: { orderId: 'ORDER-T' } } });
    expect(update.$set['payments.$.refundedAt']).toBeInstanceOf(Date);
    // Three months off the sponsor's own date, not the plan's (which includes the clinic's month).
    const back = Math.round((sponsorPaidThrough.value!.getTime() - update.$set.paidThrough.getTime()) / 86_400_000);
    expect(back).toBeGreaterThanOrEqual(89);
    expect(back).toBeLessThanOrEqual(92);
    expect(update.$set.paidThrough.getTime()).toBeLessThanOrEqual(doc.subscription.expiresAt.getTime());
  });

  it('when a refund cancels the plan, the sponsor comes off it and the sponsorship has no paid time', async () => {
    const end = new Date(Date.now() + 20 * 86_400_000);
    const doc = tenantWith(end, { transactionId: 'CAP-U', orderId: 'ORDER-U', amount: 2500, months: 1, sponsorshipId: 'sp2', status: 'completed' }, 'ORDER-U');
    doc.subscription.sponsor = { sponsorshipId: 'sp2', repId: 'r', repName: 'Ana' };
    await reverseSubscriptionPayment({ transactionId: 'CAP-U' }, 'full');
    expect(doc.subscription.status).toBe('cancelled');
    expect(doc.subscription.sponsor).toBeUndefined();
    const [, update] = vi.mocked(ClinicSponsorship.updateOne).mock.calls[0] as any[];
    expect(update.$unset).toEqual({ paidThrough: 1 });
  });
});
