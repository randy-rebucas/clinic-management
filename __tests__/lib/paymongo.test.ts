import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/PaypalOrder', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/models/Invoice', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/lib/subscription', () => ({ activateSubscriptionFromOrder: vi.fn() }));
vi.mock('@/lib/invoice-payments', () => ({ recordInvoicePayments: vi.fn() }));

import Invoice from '@/models/Invoice';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import PaypalOrder from '@/models/PaypalOrder';
import { activateSubscriptionFromOrder } from '@/lib/subscription';
import { recordInvoicePayments } from '@/lib/invoice-payments';
import { verifyPaymongoSignature, type CheckoutSession } from '@/lib/paymongo';
import { applyPaidCheckout } from '@/lib/paymongo-apply';

const SECRET = 'whsk_test_secret';
const NOW = 1_760_000_000_000;
const sign = (t: number, body: string) => createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');

describe('verifyPaymongoSignature', () => {
  const body = '{"data":{"id":"evt_1"}}';
  const t = Math.floor(NOW / 1000);

  it('accepts the test signature for a test event and the live one for a live event', () => {
    expect(verifyPaymongoSignature(`t=${t},te=${sign(t, body)},li=`, body, SECRET, false, NOW)).toBe(true);
    expect(verifyPaymongoSignature(`t=${t},te=,li=${sign(t, body)}`, body, SECRET, true, NOW)).toBe(true);
  });
  it('refuses a test signature on a live event', () => {
    expect(verifyPaymongoSignature(`t=${t},te=${sign(t, body)},li=`, body, SECRET, true, NOW)).toBe(false);
  });
  it('refuses a changed body, a wrong secret, a missing header and an old timestamp', () => {
    expect(verifyPaymongoSignature(`t=${t},te=${sign(t, body)}`, body + ' ', SECRET, false, NOW)).toBe(false);
    expect(verifyPaymongoSignature(`t=${t},te=${sign(t, body)}`, body, 'other', false, NOW)).toBe(false);
    expect(verifyPaymongoSignature(null, body, SECRET, false, NOW)).toBe(false);
    const old = t - 3600;
    expect(verifyPaymongoSignature(`t=${old},te=${sign(old, body)}`, body, SECRET, false, NOW)).toBe(false);
  });
});

const TENANT = '507f1f77bcf86cd799439011';
const session = (metadata: Record<string, string>, amount = 1499): CheckoutSession => ({
  id: 'cs_abc',
  checkoutUrl: 'https://checkout.paymongo.com/cs_abc',
  status: 'active',
  payments: [{ id: 'pay_1', amount, status: 'paid', method: 'gcash' }],
  metadata,
});

describe('applyPaidCheckout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('activates the subscription, rebuilding a lapsed order from the checkout', async () => {
    vi.mocked(activateSubscriptionFromOrder).mockResolvedValue({ ok: true, alreadyApplied: false, subscription: {} });
    const r = await applyPaidCheckout(session({ purpose: 'subscription', orderId: 'pm_x', tenantId: TENANT, plan: 'basic', billingCycle: 'monthly', amount: '1499' }));
    expect(r).toEqual({ ok: true, applied: true });
    expect(PaypalOrder.updateOne).toHaveBeenCalledWith({ orderId: 'pm_x' }, expect.objectContaining({ $setOnInsert: expect.objectContaining({ plan: 'basic', currency: 'PHP' }) }), { upsert: true });
    expect(activateSubscriptionFromOrder).toHaveBeenCalledWith('pm_x', { transactionId: 'pay_1', amount: 1499, currency: 'PHP' });
  });

  it('posts an online payment to the invoice once', async () => {
    const invoiceId = String(new Types.ObjectId());
    vi.mocked(Invoice.exists).mockResolvedValue(null);
    vi.mocked(recordInvoicePayments).mockResolvedValue({ ok: true, invoice: {} });
    await applyPaidCheckout(session({ purpose: 'invoice', tenantId: TENANT, invoiceId }, 850));
    expect(vi.mocked(recordInvoicePayments).mock.calls[0][0].payments[0]).toMatchObject({ method: 'online', amount: 850, referenceNo: 'pay_1' });

    vi.mocked(Invoice.exists).mockResolvedValue({ _id: invoiceId } as any);
    const again = await applyPaidCheckout(session({ purpose: 'invoice', tenantId: TENANT, invoiceId }, 850));
    expect(again).toMatchObject({ ok: true, applied: false });
    expect(recordInvoicePayments).toHaveBeenCalledTimes(1);
  });

  it('activates a medical rep only when the full fee was paid', async () => {
    const repId = String(new Types.ObjectId());
    vi.mocked(MedicalRepresentative.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
    expect(await applyPaidCheckout(session({ purpose: 'medrep', repId, amount: '1000' }, 500))).toMatchObject({ ok: false });
    expect(MedicalRepresentative.updateOne).not.toHaveBeenCalled();
    expect(await applyPaidCheckout(session({ purpose: 'medrep', repId, amount: '1000' }, 1000))).toEqual({ ok: true, applied: true });
  });

  it('does nothing for an unpaid checkout', async () => {
    const r = await applyPaidCheckout({ ...session({ purpose: 'subscription' }), payments: [] });
    expect(r).toMatchObject({ ok: true, applied: false });
    expect(activateSubscriptionFromOrder).not.toHaveBeenCalled();
  });
});
