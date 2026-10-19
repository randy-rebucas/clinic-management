import 'server-only';
import { Types } from 'mongoose';
import { after } from 'next/server';
import Invoice from '@/models/Invoice';
import { roundMoney } from '@/lib/invoice-totals';
import type { InvoicePaymentMethod } from '@/models/Invoice';

export const PAYMENT_EPSILON = 0.005;

export interface NewPayment {
  method: InvoicePaymentMethod;
  amount: number;
  date?: Date;
  receiptNo?: string;
  referenceNo?: string;
  notes?: string;
  processedBy?: string | Types.ObjectId | null;
}

export type RecordResult =
  | { ok: true; invoice: any }
  | { ok: false; status: number; error: string };

/**
 * Add payments to an invoice in one atomic write: the outstanding-balance guard, the push, and
 * the recomputed totals and status, so concurrent payments (a cashier, an HMO remittance, an
 * online payment) can never overpay it. Several payments land together or not at all.
 */
export async function recordInvoicePayments(opts: {
  tenantId: string | Types.ObjectId;
  invoiceId: string | Types.ObjectId;
  payments: NewPayment[];
  /** Extra fields set in the same write (e.g. the insurance claim's status). */
  alsoSet?: Record<string, unknown>;
}): Promise<RecordResult> {
  const tenantId = new Types.ObjectId(String(opts.tenantId));
  const query = { tenantId, _id: new Types.ObjectId(String(opts.invoiceId)) };
  const payments = opts.payments
    .map((p) => ({
      _id: new Types.ObjectId(),
      method: p.method,
      amount: roundMoney(p.amount),
      date: p.date ?? new Date(),
      receiptNo: p.receiptNo,
      referenceNo: p.referenceNo,
      processedBy: p.processedBy ? new Types.ObjectId(String(p.processedBy)) : undefined,
      notes: p.notes,
    }))
    .filter((p) => p.amount > 0);
  if (!payments.length) return { ok: false, status: 400, error: 'Nothing to record' };
  const amount = roundMoney(payments.reduce((s, p) => s + p.amount, 0));

  const current: any = await Invoice.findOne(query).select('total payments status').lean();
  if (!current) return { ok: false, status: 404, error: 'Invoice not found' };
  if (current.status === 'refunded') return { ok: false, status: 409, error: 'Cannot record a payment on a refunded invoice' };
  const outstanding = roundMoney((Number(current.total) || 0) - (current.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));
  if (amount > outstanding + PAYMENT_EPSILON) {
    return { ok: false, status: 400, error: `Payment exceeds the outstanding balance (${outstanding.toFixed(2)})` };
  }

  const paymentsSum = { $round: [{ $sum: { $ifNull: ['$payments.amount', []] } }, 2] };
  const totalExpr = { $ifNull: ['$total', 0] };
  const invoice = await Invoice.findOneAndUpdate(
    {
      ...query,
      status: { $ne: 'refunded' },
      $expr: { $gte: [{ $subtract: [totalExpr, paymentsSum] }, amount - PAYMENT_EPSILON] },
    },
    [
      {
        $set: {
          payments: { $concatArrays: [{ $ifNull: ['$payments', []] }, payments.map((p) => ({ $literal: p }))] },
          ...Object.fromEntries(Object.entries(opts.alsoSet ?? {}).map(([k, v]) => [k, { $literal: v }])),
        },
      },
      { $set: { totalPaid: paymentsSum } },
      { $set: { outstandingBalance: { $round: [{ $subtract: [totalExpr, '$totalPaid'] }, 2] } } },
      {
        $set: {
          status: {
            $switch: {
              branches: [
                { case: { $lte: ['$outstandingBalance', 0] }, then: 'paid' },
                { case: { $gt: ['$totalPaid', 0] }, then: 'partial' },
              ],
              default: 'unpaid',
            },
          },
          updatedAt: '$$NOW',
        },
      },
    ],
    { new: true }
  );
  if (!invoice) return { ok: false, status: 409, error: 'Invoice changed while recording the payment. Please reload and try again.' };
  if (current.status !== 'paid' && invoice.status === 'paid') {
    const paid = invoice.toObject ? invoice.toObject() : invoice;
    const send = () =>
      import('@/lib/webhook-events')
        .then(({ onInvoicePaid }) => onInvoicePaid(paid))
        .catch((error) => console.error('[webhooks] invoice.paid:', error));
    try {
      after(send);
    } catch {
      void send();
    }
  }
  return { ok: true, invoice };
}
