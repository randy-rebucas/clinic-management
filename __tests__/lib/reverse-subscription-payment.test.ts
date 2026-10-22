import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/platform-config', () => ({ getPlanPricing: vi.fn() }));
vi.mock('@/lib/platform-invoice', () => ({ cancelSubscriptionInvoice: vi.fn(async () => {}) }));
vi.mock('@/models/SubscriptionOrder', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn() } }));

import Tenant from '@/models/Tenant';
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
});
