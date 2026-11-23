import 'server-only';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import VoucherPurchase from '@/models/VoucherPurchase';
import ActivationCode from '@/models/ActivationCode';
import { decryptData, encryptData } from '@/lib/encryption';
import { getPlatformFees } from '@/lib/platform-config';
import { createCheckoutSession, isPayMongoConfigured, paidTotal, retrieveCheckoutSession, type CheckoutSession } from '@/lib/paymongo';
import { escapeHtml, isEmailConfigured, sendEmail } from '@/lib/email';
import { ACTIVATION_DAYS, formatActivationCode, generateActivationCode, hashActivationCode } from '@/lib/emcr/activation';

/**
 * eMCR activation bought online at /voucher, paid through the platform's PayMongo account at the
 * voucher face value (Platform → Configuration → fees). The code is drawn when checkout starts
 * and kept encrypted on the purchase; it becomes redeemable only when the payment is applied,
 * which writes its ActivationCode row. The return page (/voucher/<token>) and an email show it.
 *
 * Applying is idempotent: the code's hash is unique, so a webhook and the return page applying
 * the same payment at once write one row, and the purchase flips to paid once.
 */

export type StartResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; status: number; error: string };

export async function startVoucherPurchase(email: string, origin: string): Promise<StartResult> {
  if (!(await isPayMongoConfigured())) return { ok: false, status: 503, error: 'Online payment isn’t available right now. Please buy a voucher at your clinic.' };
  await connectDB();
  const { voucherFaceValue } = await getPlatformFees();
  // PayMongo's smallest charge is ₱20.
  if (!(voucherFaceValue >= 20)) return { ok: false, status: 503, error: 'Online vouchers aren’t on sale right now. Please buy one at your clinic.' };

  const token = randomBytes(24).toString('base64url');
  const purchase = await VoucherPurchase.create({
    token,
    email,
    amount: voucherFaceValue,
    days: ACTIVATION_DAYS,
    status: 'pending',
    codeEncrypted: encryptData(generateActivationCode()),
  });

  const base = origin.replace(/\/$/, '');
  const session = await createCheckoutSession({
    name: 'eMCR activation voucher (1 year)',
    amount: voucherFaceValue,
    description: 'One year of the eMCR patient app. Your activation code appears after payment and is emailed to you.',
    referenceNumber: `EMCR-${String(purchase._id).slice(-8).toUpperCase()}`,
    successUrl: `${base}/voucher/${token}`,
    cancelUrl: `${base}/voucher?cancelled=1`,
    metadata: { purpose: 'emcr-voucher', purchaseId: String(purchase._id), amount: String(voucherFaceValue) },
    email,
  });
  await VoucherPurchase.updateOne({ _id: purchase._id }, { $set: { checkoutSessionId: session.id } });
  return { ok: true, checkoutUrl: session.checkoutUrl };
}

export type ApplyVoucherResult = { ok: true; applied: boolean } | { ok: false; retry: boolean; error: string };

/** Apply a paid checkout (from a signed webhook, or read back from PayMongo) to its purchase. */
export async function applyVoucherPurchasePayment(
  m: Record<string, string>,
  paid: number,
  paymentId: string,
  checkoutSessionId: string
): Promise<ApplyVoucherResult> {
  if (!m.purchaseId || !Types.ObjectId.isValid(m.purchaseId)) return { ok: false, retry: false, error: 'Voucher checkout without its purchase' };
  await connectDB();
  const purchase = await VoucherPurchase.findById(m.purchaseId).select('+codeEncrypted').lean<any>();
  if (!purchase) return { ok: false, retry: false, error: `Voucher purchase ${m.purchaseId} not found (paid ${paid}, payment ${paymentId})` };
  if (purchase.status === 'paid') return { ok: true, applied: false };
  if (purchase.checkoutSessionId && purchase.checkoutSessionId !== checkoutSessionId) {
    return { ok: false, retry: false, error: `Voucher purchase ${m.purchaseId} paid through another checkout ${checkoutSessionId}` };
  }
  if (paid + 0.005 < purchase.amount) return { ok: false, retry: false, error: `Voucher paid ${paid}, price is ${purchase.amount}` };

  const code = decryptData(purchase.codeEncrypted);
  const codeHash = hashActivationCode(code);
  let codeId: Types.ObjectId;
  try {
    const row = await ActivationCode.create({
      codeHash,
      codeEncrypted: purchase.codeEncrypted,
      last4: code.slice(-4),
      purchaseId: purchase._id,
      status: 'unsold',
    });
    codeId = row._id as Types.ObjectId;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    // Another delivery wrote it first.
    const existing = await ActivationCode.findOne({ codeHash }).select('_id purchaseId').lean<{ _id: Types.ObjectId; purchaseId?: Types.ObjectId } | null>();
    if (!existing || String(existing.purchaseId) !== String(purchase._id)) {
      return { ok: false, retry: false, error: `Voucher purchase ${m.purchaseId}: its code collides with another code` };
    }
    codeId = existing._id;
  }

  const res = await VoucherPurchase.updateOne(
    { _id: purchase._id, status: 'pending' },
    { $set: { status: 'paid', paidAt: new Date(), paidAmount: paid, paymentId, activationCodeId: codeId } }
  );
  if (res.modifiedCount > 0) {
    await emailVoucherCode(purchase._id, purchase.email, code, purchase.token).catch((error) =>
      console.error('eMCR voucher email failed:', error)
    );
  }
  return { ok: true, applied: res.modifiedCount > 0 };
}

/** Email the code to the buyer (or `email`). False when email isn't set up or the send failed. */
export async function emailVoucherCode(purchaseId: Types.ObjectId, email: string, code: string, token: string): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const pretty = formatActivationCode(code);
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.myclinicsoft.solutions').replace(/\/$/, '');
  const link = `${base}/voucher/${token}`;
  const r = await sendEmail({
    to: email,
    subject: 'Your eMCR activation code',
    text: [
      'Thank you for buying an eMCR activation voucher.',
      '',
      `Your activation code: ${pretty}`,
      '',
      'To activate: open the eMCR app, go to More → Activation, and enter the code (or scan the QR on this page:',
      link,
      ').',
      '',
      'The code gives one year of eMCR for you and the family members you manage. It can be used once.',
    ].join('\n'),
    html: `
      <p>Thank you for buying an eMCR activation voucher.</p>
      <p>Your activation code:</p>
      <p style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: bold; letter-spacing: 2px;">${escapeHtml(pretty)}</p>
      <p>To activate: open the eMCR app, go to <strong>More → Activation</strong>, and enter the code.
      You can also <a href="${escapeHtml(link)}">open your voucher</a> and scan its QR code with the app.</p>
      <p style="color: #555;">The code gives one year of eMCR for you and the family members you manage. It can be used once, so keep it private.</p>`,
  });
  if (r.success) await VoucherPurchase.updateOne({ _id: purchaseId }, { $set: { emailedAt: new Date() } });
  return r.success;
}

export type PaymentCheck =
  | { state: 'paid' }
  | { state: 'unpaid'; checkoutStatus: string }
  | { state: 'no_checkout' }
  | { state: 'failed'; error: string };

/**
 * Ask PayMongo about a purchase still pending and apply the payment when there is one. Used by
 * the return page and by the platform's "Check payment" (a webhook that never arrived).
 */
export async function checkPendingPayment(purchase: { _id: Types.ObjectId; status: string; checkoutSessionId?: string }): Promise<PaymentCheck> {
  if (purchase.status === 'paid') return { state: 'paid' };
  if (!purchase.checkoutSessionId) return { state: 'no_checkout' };
  try {
    const session: CheckoutSession = await retrieveCheckoutSession(purchase.checkoutSessionId);
    const paid = paidTotal(session);
    if (paid <= 0) return { state: 'unpaid', checkoutStatus: session.status };
    const paymentId = session.payments.find((p) => p.status === 'paid')?.id ?? session.id;
    const r = await applyVoucherPurchasePayment(session.metadata, paid, paymentId, session.id);
    if (!r.ok) {
      console.error(`eMCR voucher ${purchase._id} not applied: ${r.error}`);
      return { state: 'failed', error: r.error };
    }
    return { state: 'paid' };
  } catch (error) {
    console.error('Checking an eMCR voucher payment failed:', error);
    return { state: 'failed', error: 'PayMongo didn’t answer.' };
  }
}

export type VoucherView =
  | { state: 'missing' }
  | { state: 'pending' }
  | { state: 'paid'; code: string; redeemed: boolean; email: string; days: number };

/**
 * What the return page shows for `token`. A purchase still pending is checked against PayMongo
 * (the buyer usually lands here before the webhook), and applied when it has been paid.
 */
export async function readVoucherPurchase(token: string): Promise<VoucherView> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { state: 'missing' };
  await connectDB();
  let purchase = await VoucherPurchase.findOne({ token }).select('+codeEncrypted').lean<any>();
  if (!purchase) return { state: 'missing' };

  if (purchase.status === 'pending') {
    const check = await checkPendingPayment(purchase);
    if (check.state === 'paid') purchase = await VoucherPurchase.findOne({ token }).select('+codeEncrypted').lean<any>();
  }
  if (!purchase || purchase.status !== 'paid') return { state: 'pending' };

  const row = purchase.activationCodeId
    ? await ActivationCode.findById(purchase.activationCodeId).select('status').lean<{ status: string } | null>()
    : null;
  return {
    state: 'paid',
    code: formatActivationCode(decryptData(purchase.codeEncrypted)),
    redeemed: row?.status === 'redeemed',
    email: purchase.email,
    days: purchase.days,
  };
}
