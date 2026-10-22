import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import PaymentAccount, { isOnlineProvider, type IPaymentAccount } from '@/models/PaymentAccount';
import { createSignedLinkToken, readSignedLinkToken } from '@/lib/signed-link';
import { recordInvoicePayments } from '@/lib/invoice-payments';
import { getSettings } from '@/lib/settings';
import { createAuditLog } from '@/lib/audit';
import { adapterFor } from './registry';
import { invoicePayOptions, loadCredentials } from './accounts';
import { PROVIDER_LABEL } from './account-schema';
import type { GatewayEvent } from './types';

/**
 * Paying a clinic invoice into the clinic's (or its doctor's) own account:
 * - staff send the patient a signed link to the pay page (/pay/<token>), never a raw checkout;
 * - the page starts a checkout with the chosen online account for what is owed right then, or
 *   shows the QR / bank details and takes an "I've paid" claim for staff to confirm;
 * - the provider's notice reaches that account's own webhook, is verified with its own secret,
 *   and must match the invoice, the account and a checkout this invoice started.
 */

const PURPOSE = 'invoice-pay';
const PAY_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** PayMongo's (and the others') smallest charge. */
export const MIN_ONLINE_AMOUNT = 20;

export function createPayPageToken(tenantId: string, invoiceId: string, accountId?: string | null) {
  return createSignedLinkToken(PURPOSE, [tenantId, invoiceId, accountId || 'any'], PAY_LINK_TTL_MS);
}

export function readPayPageToken(token: string): { tenantId: string; invoiceId: string; accountId: string | null } | null {
  const parts = readSignedLinkToken(PURPOSE, token, 3);
  if (!parts) return null;
  const [tenantId, invoiceId, accountId] = parts;
  if (!Types.ObjectId.isValid(tenantId) || !Types.ObjectId.isValid(invoiceId)) return null;
  return { tenantId, invoiceId, accountId: accountId !== 'any' && Types.ObjectId.isValid(accountId) ? accountId : null };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function loadInvoice(tenantId: string, invoiceId: string) {
  return Invoice.findOne({ _id: new Types.ObjectId(invoiceId), tenantId: new Types.ObjectId(tenantId) })
    .select('invoiceNumber status total outstandingBalance professionalFeeDoctor patient paymentClaims')
    .populate({ path: 'patient', select: 'email' })
    .lean<any>();
}

/** The accounts this link offers: the one staff chose, else every usable one for the invoice. */
async function offeredAccounts(t: { tenantId: string; accountId: string | null }, invoice: any): Promise<IPaymentAccount[]> {
  const { accounts } = await invoicePayOptions(t.tenantId, invoice);
  return t.accountId ? accounts.filter((a) => String(a._id) === t.accountId) : accounts;
}

export interface PayPageView {
  clinicName: string;
  invoiceNumber: string;
  owed: number;
  status: 'open' | 'paid' | 'refunded';
  /** A claim the patient already sent and staff haven't decided yet. */
  pendingClaim: boolean;
  options: Array<{
    accountId: string;
    provider: string;
    label: string;
    online: boolean;
    /** Online: can be used for this amount. */
    payable: boolean;
    manual: { accountName: string; number: string; bankName: string; instructions: string; qrImage: string | null } | null;
  }>;
}

export async function loadPayPage(token: string): Promise<PayPageView | null> {
  const t = readPayPageToken(token);
  if (!t) return null;
  await connectDB();
  const invoice = await loadInvoice(t.tenantId, t.invoiceId);
  if (!invoice) return null;
  const settings = await getSettings(t.tenantId);
  const owed = round2(Number(invoice.outstandingBalance ?? invoice.total) || 0);
  const status: PayPageView['status'] = invoice.status === 'refunded' ? 'refunded' : owed <= 0 ? 'paid' : 'open';
  const accounts = status === 'open' ? await offeredAccounts(t, invoice) : [];
  return {
    clinicName: settings.clinicName || 'Your clinic',
    invoiceNumber: invoice.invoiceNumber,
    owed,
    status,
    pendingClaim: (invoice.paymentClaims ?? []).some((c: any) => c.status === 'pending'),
    options: accounts.map((a) => {
      const online = isOnlineProvider(a.provider);
      return {
        accountId: String(a._id),
        provider: a.provider,
        label: online ? `Pay online (${PROVIDER_LABEL[a.provider]})` : a.label,
        online,
        payable: online && owed >= MIN_ONLINE_AMOUNT,
        manual: online
          ? null
          : {
              accountName: a.manual?.accountName ?? '',
              number: a.manual?.number ?? '',
              bankName: a.manual?.bankName ?? '',
              instructions: a.manual?.instructions ?? '',
              qrImage: a.manual?.qrImage ?? null,
            },
      };
    }),
  };
}

export type CheckoutOutcome = { ok: true; url: string } | { ok: false; status: number; error: string };

/** Start an online checkout for what is owed now, into the chosen account. */
export async function startInvoiceCheckout(token: string, accountId: string, origin: string): Promise<CheckoutOutcome> {
  const t = readPayPageToken(token);
  if (!t) return { ok: false, status: 404, error: 'This payment link is invalid or has expired. Ask the clinic for a new one.' };
  await connectDB();
  const invoice = await loadInvoice(t.tenantId, t.invoiceId);
  if (!invoice || invoice.status === 'refunded') return { ok: false, status: 404, error: 'This bill can’t be paid online.' };
  const owed = round2(Number(invoice.outstandingBalance ?? invoice.total) || 0);
  if (owed <= 0) return { ok: false, status: 409, error: 'This bill is already paid.' };
  if (owed < MIN_ONLINE_AMOUNT) return { ok: false, status: 400, error: `Online payments start at ₱${MIN_ONLINE_AMOUNT}. Please pay at the clinic.` };

  const account = (await offeredAccounts(t, invoice)).find((a) => String(a._id) === accountId);
  const adapter = account && isOnlineProvider(account.provider) ? adapterFor(account.provider) : null;
  const creds = account ? await loadCredentials(account) : null;
  if (!account || !adapter || !creds) return { ok: false, status: 409, error: 'That payment option isn’t available. Choose another.' };

  const settings = await getSettings(t.tenantId);
  const clinic = settings.clinicName || 'Clinic';
  const checkout = await adapter.createCheckout(creds, {
    amount: owed,
    name: `${clinic}: invoice ${invoice.invoiceNumber}`,
    description: `Balance on invoice ${invoice.invoiceNumber}`,
    reference: invoice.invoiceNumber,
    successUrl: `${origin}/pay/done?ref=${encodeURIComponent(invoice.invoiceNumber)}`,
    cancelUrl: `${origin}/pay/${token}`,
    email: invoice.patient?.email || undefined,
    metadata: { tenantId: t.tenantId, invoiceId: t.invoiceId, accountId, invoiceNumber: invoice.invoiceNumber },
  });
  await Invoice.updateOne(
    { _id: invoice._id, tenantId: new Types.ObjectId(t.tenantId) },
    { $push: { payLinks: { $each: [{ checkoutId: checkout.id, accountId: account._id, provider: account.provider, amount: owed, createdAt: new Date() }], $slice: -50 } } }
  );
  return { ok: true, url: checkout.url };
}

export type ClaimInput = { accountId: string; amount: number; referenceNo: string; payerName?: string; note?: string };

/** The patient says they paid by QR or bank transfer: a pending claim for staff to confirm. */
export async function submitPaymentClaim(token: string, input: ClaimInput): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const t = readPayPageToken(token);
  if (!t) return { ok: false, status: 404, error: 'This payment link is invalid or has expired.' };
  await connectDB();
  const invoice = await loadInvoice(t.tenantId, t.invoiceId);
  if (!invoice || invoice.status === 'refunded') return { ok: false, status: 404, error: 'This bill can’t be paid here.' };
  const owed = round2(Number(invoice.outstandingBalance ?? invoice.total) || 0);
  if (owed <= 0) return { ok: false, status: 409, error: 'This bill is already paid.' };
  if (input.amount > owed + 0.005) return { ok: false, status: 400, error: `The balance is ₱${owed.toFixed(2)}.` };
  const pending = (invoice.paymentClaims ?? []).filter((c: any) => c.status === 'pending');
  if (pending.length >= 3) return { ok: false, status: 429, error: 'The clinic is still checking your earlier payment. Please wait for them.' };

  const account = (await offeredAccounts(t, invoice)).find((a) => String(a._id) === input.accountId && !isOnlineProvider(a.provider));
  if (!account) return { ok: false, status: 400, error: 'Choose how you paid.' };
  await Invoice.updateOne(
    { _id: invoice._id, tenantId: new Types.ObjectId(t.tenantId) },
    {
      $push: {
        paymentClaims: {
          accountId: account._id,
          method: account.provider === 'bank_transfer' ? 'bank_transfer' : 'gcash',
          amount: round2(input.amount),
          referenceNo: input.referenceNo,
          payerName: input.payerName,
          note: input.note,
          status: 'pending',
          submittedAt: new Date(),
        },
      },
    }
  );
  return { ok: true };
}

/** Staff confirm (records the payment) or reject a patient's claim. */
export async function decidePaymentClaim(opts: {
  tenantId: string;
  invoiceId: string;
  claimId: string;
  action: 'confirm' | 'reject';
  reason?: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  await connectDB();
  const tid = new Types.ObjectId(opts.tenantId);
  const claimOid = new Types.ObjectId(opts.claimId);
  // Claim it first, so a double click can't record the payment twice.
  const claimed = await Invoice.findOneAndUpdate(
    { _id: new Types.ObjectId(opts.invoiceId), tenantId: tid, paymentClaims: { $elemMatch: { _id: claimOid, status: 'pending' } } },
    {
      $set: {
        'paymentClaims.$.status': opts.action === 'confirm' ? 'confirmed' : 'rejected',
        'paymentClaims.$.decidedAt': new Date(),
        'paymentClaims.$.decidedBy': new Types.ObjectId(opts.userId),
        ...(opts.reason ? { 'paymentClaims.$.reason': opts.reason } : {}),
      },
    },
    { new: false }
  )
    .select('paymentClaims')
    .lean<any>();
  if (!claimed) return { ok: false, status: 409, error: 'This claim was already handled.' };
  if (opts.action === 'reject') return { ok: true };

  const claim = claimed.paymentClaims.find((c: any) => String(c._id) === opts.claimId);
  const r = await recordInvoicePayments({
    tenantId: opts.tenantId,
    invoiceId: opts.invoiceId,
    payments: [
      {
        method: claim.method,
        amount: claim.amount,
        referenceNo: claim.referenceNo,
        processedBy: opts.userId,
        accountId: claim.accountId,
        notes: `Confirmed from the patient's pay page${claim.payerName ? ` (paid by ${claim.payerName})` : ''}`,
      },
    ],
  });
  if (!r.ok) {
    // Put the claim back so staff can see why and decide again.
    await Invoice.updateOne(
      { _id: new Types.ObjectId(opts.invoiceId), tenantId: tid, 'paymentClaims._id': claimOid },
      { $set: { 'paymentClaims.$.status': 'pending' }, $unset: { 'paymentClaims.$.decidedAt': 1, 'paymentClaims.$.decidedBy': 1 } }
    );
    return { ok: false, status: r.status, error: r.error };
  }
  return { ok: true };
}

export type EventOutcome = { ok: true; detail: string } | { ok: false; retry: boolean; error: string };

/**
 * A verified notice from `account`'s provider. A payment counts only when the checkout belongs to
 * an invoice of the account's own clinic that started it with this very account; it is then read
 * back from the provider with the account's key, so the amount is the provider's, not the body's.
 */
export async function applyAccountEvent(account: IPaymentAccount, event: GatewayEvent): Promise<EventOutcome> {
  if (event.kind === 'ignore') return { ok: true, detail: 'ignored' };
  await connectDB();
  const tid = account.tenantId;

  if (event.kind === 'refunded') {
    const res = await Invoice.updateOne(
      { tenantId: tid, payments: { $elemMatch: { referenceNo: event.paymentId, accountId: account._id } } },
      {
        $set: {
          'payments.$.refundedAt': new Date(),
          ...(event.refundedAmount === 'full' ? {} : { 'payments.$.refundedAmount': event.refundedAmount }),
        },
      }
    );
    if (res.modifiedCount) {
      await createAuditLog({
        tenantId: String(tid),
        action: 'update',
        resource: 'invoice',
        description: `${PROVIDER_LABEL[account.provider]} reported a refund of payment ${event.paymentId}; check the invoice's balance`,
        metadata: { paymentAccountId: String(account._id), paymentId: event.paymentId, refundedAmount: event.refundedAmount },
      });
    }
    return { ok: true, detail: res.modifiedCount ? 'refund noted' : 'no matching payment' };
  }

  const invoice = await Invoice.findOne({ tenantId: tid, payLinks: { $elemMatch: { checkoutId: event.checkoutId, accountId: account._id } } })
    .select('_id invoiceNumber payments.referenceNo')
    .lean<any>();
  if (!invoice) return { ok: true, detail: 'not a checkout of this account' };

  const adapter = adapterFor(account.provider);
  const creds = await loadCredentials(account);
  if (!adapter || !creds) return { ok: false, retry: true, error: 'Account keys unavailable' };
  const state = await adapter.retrieveCheckout(creds, event.checkoutId);
  if (state.metadata.tenantId !== String(tid) || state.metadata.accountId !== String(account._id) || state.metadata.invoiceId !== String(invoice._id)) {
    return { ok: true, detail: 'checkout details do not match' };
  }
  if (state.paid <= 0 || !state.paymentId) return { ok: true, detail: 'not paid' };
  if ((invoice.payments ?? []).some((p: any) => p.referenceNo === state.paymentId)) return { ok: true, detail: 'already recorded' };

  const r = await recordInvoicePayments({
    tenantId: tid,
    invoiceId: invoice._id,
    payments: [
      {
        method: 'online',
        amount: state.paid,
        referenceNo: state.paymentId,
        accountId: account._id,
        notes: `Paid online through ${PROVIDER_LABEL[account.provider]} (${state.method ?? 'checkout'}) into ${account.label}`,
      },
    ],
  });
  // An overpayment (settled another way meanwhile) needs a person: the money is in the clinic's account.
  if (!r.ok) return { ok: false, retry: r.status === 409, error: `Invoice ${invoice.invoiceNumber}: ${r.error}` };
  return { ok: true, detail: 'payment recorded' };
}

/** For the webhook: the account a notice is addressed to, with its secrets. */
export async function accountForWebhook(provider: string, token: string): Promise<IPaymentAccount | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  await connectDB();
  return PaymentAccount.findOne({ provider, webhookToken: token }).select('+secretKeyEnc +webhookSecretEnc');
}
