import 'server-only';
import { after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Counter from '@/models/Counter';
import PlatformInvoice, { type IPlatformInvoice, type PlatformInvoiceBuyer } from '@/models/PlatformInvoice';
import { nextSequence } from '@/lib/counters';
import { formatSerial } from '@/lib/bir';
import { getBillingIssuer, platformSerialKey } from '@/lib/platform-config';
import type { BillingIssuer } from '@/lib/platform-config-schema';
import { sendEmail, escapeHtml } from '@/lib/email';
import { htmlToPdf, pdfFilename } from '@/lib/pdf';
import { platformInvoiceHTML } from '@/lib/platform-invoice-html';
import { planLabel } from '@/lib/subscription-period';

/**
 * DevCom Digital's BIR sales invoices to clinics, one per subscription payment. The seller is
 * Platform → Configuration's BIR issuer; serials come from its registered range in order with no
 * gaps (a placeholder per order is claimed before a number is drawn, as lib/bir-issue.ts does).
 * Until the issuer is entered, or once its range is used up, invoices wait as `held` and are
 * issued by issueHeldInvoices() (on saving the issuer, and by the daily cron).
 */

const LOCK_MS = 30_000;

type TenantRow = {
  _id: Types.ObjectId;
  name?: string;
  displayName?: string;
  email?: string;
  address?: { street?: string; city?: string; state?: string; zipCode?: string; country?: string };
  billingProfile?: Partial<PlatformInvoiceBuyer>;
  subscription?: {
    expiresAt?: Date;
    paymentHistory?: { orderId: string; transactionId?: string; amount: number; currency?: string; plan: string; billingCycle?: 'monthly' | 'yearly'; status?: string; paidAt?: Date }[];
  };
};

function buyerOf(t: TenantRow): PlatformInvoiceBuyer {
  const p = t.billingProfile ?? {};
  const a = t.address ?? {};
  return {
    registeredName: p.registeredName?.trim() || t.displayName || t.name || 'Clinic',
    tin: p.tin?.trim() || '',
    address: p.address?.trim() || [a.street, a.city, [a.state, a.zipCode].filter(Boolean).join(' '), a.country].filter(Boolean).join(', '),
    email: p.email?.trim() || t.email || '',
  };
}

/** VAT inside a VAT-inclusive amount, for a VAT-registered issuer; none otherwise. */
export function vatSplit(amount: number, issuer: Pick<BillingIssuer, 'vatRegime' | 'vatRate'>): { vatableSales: number; vatAmount: number } {
  if (issuer.vatRegime !== 'vat' || issuer.vatRate <= 0) return { vatableSales: 0, vatAmount: 0 };
  const vatableSales = Math.round((amount / (1 + issuer.vatRate / 100)) * 100) / 100;
  return { vatableSales, vatAmount: Math.round((amount - vatableSales) * 100) / 100 };
}

export type IssueOutcome =
  | { status: 'issued'; invoice: IPlatformInvoice; fresh: boolean }
  | { status: 'held'; reason: string }
  | { status: 'cancelled' | 'busy' | 'not-found' };

/**
 * Issue the sales invoice for a completed subscription payment, once. Safe to call again and
 * from several places at once: it returns the existing invoice, or waits it out as `busy`.
 */
export async function issueSubscriptionInvoice(orderId: string): Promise<IssueOutcome> {
  await connectDB();
  const tenant = await Tenant.findOne({ 'subscription.paymentHistory.orderId': orderId })
    .select('name displayName email address billingProfile subscription.expiresAt subscription.paymentHistory')
    .lean<TenantRow | null>();
  const payment = tenant?.subscription?.paymentHistory?.find((p) => p.orderId === orderId);
  if (!tenant || !payment) return { status: 'not-found' };

  // The placeholder: one per order, whatever happens next.
  const placeholder = await PlatformInvoice.findOneAndUpdate(
    { orderId },
    {
      $setOnInsert: {
        orderId,
        tenantId: tenant._id,
        transactionId: payment.transactionId,
        plan: payment.plan,
        billingCycle: payment.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        paidThrough: tenant.subscription?.expiresAt,
        paidAt: payment.paidAt ?? new Date(),
        amount: payment.amount,
        currency: payment.currency || 'PHP',
        status: (payment.status ?? 'completed') === 'completed' ? 'pending' : 'cancelled',
      },
    },
    { upsert: true, new: true }
  );
  if (placeholder.status === 'issued') return { status: 'issued', invoice: placeholder, fresh: false };
  if (placeholder.status === 'cancelled') return { status: 'cancelled' };

  const issuer = await getBillingIssuer();
  if (!issuer) return hold(orderId, 'The BIR issuer details aren’t entered in Platform → Configuration yet.');

  const now = new Date();
  const claimed = await PlatformInvoice.findOneAndUpdate(
    {
      orderId,
      status: { $in: ['pending', 'held'] },
      serialNo: { $exists: false },
      $or: [{ lockAt: { $exists: false } }, { lockAt: { $lt: new Date(now.getTime() - LOCK_MS) } }],
    },
    { $set: { lockAt: now } },
    { new: true }
  );
  if (!claimed) {
    const again = await PlatformInvoice.findOne({ orderId });
    if (again?.status === 'issued') return { status: 'issued', invoice: again, fresh: false };
    return { status: 'busy' };
  }

  try {
    const key = platformSerialKey(issuer.serialPrefix);
    // A newly registered range starts where BIR says, even if the counter is behind it.
    await Counter.updateOne({ tenantId: null, key }, { $max: { seq: issuer.serialStart - 1 } }, { upsert: true });
    const seq = await nextSequence(null, key);
    if (seq > issuer.serialEnd) {
      // Hand the number back so the next registered range starts exactly where BIR says.
      await Counter.updateOne({ tenantId: null, key, seq }, { $inc: { seq: -1 } });
      await PlatformInvoice.updateOne({ orderId }, { $unset: { lockAt: 1 } });
      return hold(orderId, `The serial range ends at ${formatSerial(issuer.serialPrefix, issuer.serialEnd)} and is used up. Enter the new range in Platform → Configuration.`);
    }
    const issued = await PlatformInvoice.findOneAndUpdate(
      { orderId },
      {
        $set: {
          serialNo: formatSerial(issuer.serialPrefix, seq),
          status: 'issued',
          issuedAt: now,
          seller: issuer,
          buyer: buyerOf(tenant),
          ...vatSplit(claimed.amount, issuer),
        },
        $unset: { lockAt: 1, heldReason: 1 },
      },
      { new: true }
    );
    if (!issued) return { status: 'not-found' };
    await emailInvoice(issued).catch((error) => console.error(`Platform invoice ${issued.serialNo}: email failed`, error));
    return { status: 'issued', invoice: issued, fresh: true };
  } catch (error) {
    await PlatformInvoice.updateOne({ orderId }, { $unset: { lockAt: 1 } }).catch(() => {});
    throw error;
  }
}

async function hold(orderId: string, reason: string): Promise<IssueOutcome> {
  await PlatformInvoice.updateOne({ orderId, status: { $in: ['pending', 'held'] } }, { $set: { status: 'held', heldReason: reason } });
  return { status: 'held', reason };
}

/**
 * Issue after the response is sent (activation must never wait on, or fail because of, the
 * invoice). Outside a request (tests, scripts) it simply runs.
 */
export function scheduleSubscriptionInvoice(orderId: string): void {
  const run = () =>
    issueSubscriptionInvoice(orderId).catch((error) => console.error(`Platform invoice for order ${orderId} failed`, error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** issueHeldInvoices after the response (saving the issuer must not wait on it). */
export function scheduleHeldInvoices(): void {
  const run = () => issueHeldInvoices().catch((error) => console.error('Issuing held platform invoices failed', error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Issue every invoice still waiting: held ones, and paid subscription payments that never got
 * one (a crash between activation and issue). Bounded per run; the cron calls it daily.
 */
export async function issueHeldInvoices(limit = 50): Promise<{ issued: number; held: number }> {
  await connectDB();
  const waiting = await PlatformInvoice.find({ status: { $in: ['pending', 'held'] } }).select('orderId').limit(limit).lean<{ orderId: string }[]>();
  const missing = await Tenant.aggregate<{ orderId: string }>([
    { $match: { 'subscription.paymentHistory.status': 'completed' } },
    { $unwind: '$subscription.paymentHistory' },
    { $match: { 'subscription.paymentHistory.status': 'completed', 'subscription.paymentHistory.paidAt': { $gte: new Date(Date.now() - 400 * 86_400_000) } } },
    { $lookup: { from: PlatformInvoice.collection.collectionName, localField: 'subscription.paymentHistory.orderId', foreignField: 'orderId', as: 'inv' } },
    { $match: { inv: { $size: 0 } } },
    { $project: { _id: 0, orderId: '$subscription.paymentHistory.orderId' } },
    { $limit: limit },
  ]);
  let issued = 0;
  let held = 0;
  for (const { orderId } of [...waiting, ...missing]) {
    const r = await issueSubscriptionInvoice(orderId).catch(() => null);
    if (r?.status === 'issued' && r.fresh) issued++;
    else if (r?.status === 'held') held++;
  }
  return { issued, held };
}

/**
 * A refunded or charged-back payment: its invoice is cancelled, never deleted, and keeps its
 * serial. An invoice not issued yet is cancelled before it takes one.
 */
export async function cancelSubscriptionInvoice(orderId: string, reason: string): Promise<void> {
  await connectDB();
  await PlatformInvoice.updateOne(
    { orderId, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', cancelledAt: new Date(), cancelledReason: reason }, $unset: { lockAt: 1 } }
  );
}

export function renderPlatformInvoice(invoice: IPlatformInvoice | Record<string, any>): string {
  return platformInvoiceHTML({ invoice: invoice as any, timezone: 'Asia/Manila' });
}

/** Email the invoice to the clinic's billing address, as a PDF when one can be made. */
export async function emailInvoice(invoice: IPlatformInvoice): Promise<boolean> {
  const to = invoice.buyer?.email;
  if (!to || invoice.status !== 'issued') return false;
  const html = renderPlatformInvoice(invoice);
  const filename = pdfFilename('Sales-Invoice', invoice.serialNo);
  let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
  try {
    attachments = [{ filename, content: Buffer.from(await htmlToPdf(html)), contentType: 'application/pdf' }];
  } catch (error) {
    console.error(`Platform invoice ${invoice.serialNo}: PDF failed, emailing without it`, error);
  }
  const seller = invoice.seller?.sellerName || 'DevCom Digital';
  const plan = `${planLabel(invoice.plan)} plan, ${invoice.billingCycle}`;
  const result = await sendEmail({
    to,
    subject: `Sales invoice ${invoice.serialNo} for your MyClinicSoft subscription`,
    html: `<p>Thank you for your payment.</p>
<p>${escapeHtml(seller)} issued sales invoice <strong>${escapeHtml(invoice.serialNo)}</strong> for your MyClinicSoft ${escapeHtml(plan)}
(₱${escapeHtml(invoice.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 }))}).</p>
<p>${attachments ? 'It is attached to this email. ' : ''}You can also download it any time from Admin → Subscription → Payments.</p>`,
    attachments,
  });
  if (result.success) await PlatformInvoice.updateOne({ _id: invoice._id }, { $set: { emailedAt: new Date() } });
  return result.success;
}
