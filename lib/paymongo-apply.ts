import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import SubscriptionOrder from '@/models/SubscriptionOrder';
import Invoice from '@/models/Invoice';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { activateSubscriptionFromOrder, type ActivationResult } from '@/lib/subscription';
import { recordInvoicePayments } from '@/lib/invoice-payments';
import { isPaidPlan } from '@/lib/subscription-period';
import { paidTotal, type CheckoutSession } from '@/lib/paymongo';

export type ApplyResult = { ok: true; applied: boolean; detail?: string } | { ok: false; retry: boolean; error: string };

const isOid = (v: unknown): v is string => typeof v === 'string' && Types.ObjectId.isValid(v);

/**
 * Apply a paid PayMongo checkout to what it was for, once: a subscription period, a payment on
 * an invoice, or a medical rep's activation. `session` must come from PayMongo (a signed webhook,
 * or retrieved with our secret key), so its metadata, which we set, can be trusted.
 * Safe to call again for the same session: each purpose checks it hasn't been applied.
 */
export async function applyPaidCheckout(session: CheckoutSession): Promise<ApplyResult> {
  await connectDB();
  const paid = paidTotal(session);
  if (paid <= 0) return { ok: true, applied: false, detail: 'not paid' };
  const m = session.metadata;
  const paymentId = session.payments.find((p) => p.status === 'paid')?.id ?? session.id;

  if (m.purpose === 'subscription') {
    const orderId = m.orderId;
    if (!orderId || !isOid(m.tenantId) || !isPaidPlan(m.plan)) return { ok: false, retry: false, error: 'Subscription checkout without its order details' };
    // The order record lapses after a while unpaid; the checkout's own details rebuild it.
    await SubscriptionOrder.updateOne(
      { orderId },
      {
        $setOnInsert: {
          orderId,
          tenantId: new Types.ObjectId(m.tenantId),
          plan: m.plan,
          billingCycle: m.billingCycle === 'yearly' ? 'yearly' : 'monthly',
          amount: Number(m.amount) || paid,
          currency: 'PHP',
          provider: 'paymongo',
          gatewayId: session.id,
          status: 'pending',
        },
      },
      { upsert: true }
    );
    const r: ActivationResult = await activateSubscriptionFromOrder(orderId, { transactionId: paymentId, amount: paid, currency: 'PHP' });
    if (!r.ok) return { ok: false, retry: r.status === 409, error: r.error };
    return { ok: true, applied: !r.alreadyApplied };
  }

  if (m.purpose === 'invoice') {
    if (!isOid(m.tenantId) || !isOid(m.invoiceId)) return { ok: false, retry: false, error: 'Invoice checkout without its invoice' };
    const already = await Invoice.exists({ _id: new Types.ObjectId(m.invoiceId), tenantId: new Types.ObjectId(m.tenantId), 'payments.referenceNo': paymentId });
    if (already) return { ok: true, applied: false, detail: 'already recorded' };
    const r = await recordInvoicePayments({
      tenantId: m.tenantId,
      invoiceId: m.invoiceId,
      payments: [{ method: 'online', amount: paid, referenceNo: paymentId, notes: `Paid online through PayMongo (${session.payments[0]?.method ?? 'checkout'})` }],
    });
    // An overpayment (the bill was settled another way meanwhile) needs a person: the money is in PayMongo.
    if (!r.ok) return { ok: false, retry: r.status === 409, error: `Invoice ${m.invoiceId}: ${r.error}` };
    return { ok: true, applied: true };
  }

  if (m.purpose === 'medrep') {
    if (!isOid(m.repId)) return { ok: false, retry: false, error: 'Activation checkout without its rep' };
    const fee = Number(m.amount) || 0;
    if (paid + 0.005 < fee) return { ok: false, retry: false, error: `Activation paid ${paid}, fee is ${fee}` };
    const res = await MedicalRepresentative.updateOne(
      { _id: new Types.ObjectId(m.repId), paymentStatus: { $ne: 'completed' } },
      {
        $set: {
          isActivated: true,
          paymentStatus: 'completed',
          paymentDate: new Date(),
          activationDate: new Date(),
          paymentReference: paymentId,
          paymentMethod: `paymongo:${session.payments[0]?.method ?? 'checkout'}`,
          paymentAmount: paid,
          status: 'active',
        },
      }
    );
    return { ok: true, applied: res.modifiedCount > 0 };
  }

  return { ok: false, retry: false, error: `Unknown checkout purpose ${m.purpose}` };
}
