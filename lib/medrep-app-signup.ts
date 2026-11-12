import 'server-only';
import { randomBytes, randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import { escapeHtml, isEmailConfigured, sendEmail } from '@/lib/email';
import { otpAvailable, startOtp } from '@/lib/otp';
import { isMedRepSelfSignupEnabled } from '@/lib/medrep-signup';
import { hashInviteToken, isInviteTokenFormat } from '@/lib/user-invite';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { getPlatformFees } from '@/lib/platform-config';
import RepAppSignup, { type IRepAppSignup } from '@/models/RepAppSignup';
import MedicalRepresentative from '@/models/MedicalRepresentative';

/**
 * Medical rep signup from the rep app: details → emailed code → texted code → password → payment.
 * Routes: /api/medical-representatives/onboard/app/{start,verify,resend,complete,checkout}.
 */

/** How long the whole signup can take before it must start again. */
export const APP_SIGNUP_TTL_MS = 60 * 60 * 1000;
export const EMAIL_CODE_TTL_MINUTES = 10;
export const MAX_EMAIL_CODE_ATTEMPTS = 5;
/** Below this PayMongo won't take a card payment; activation is then done by our team. */
export const MIN_ONLINE_ACTIVATION_FEE = 20;

const EMAIL_CODE_FORMAT = /^\d{6}$/;

export const SIGNUP_EXPIRED = 'This sign-up has expired. Please start again.';

export function signupExpiredResponse() {
  return NextResponse.json({ success: false, error: SIGNUP_EXPIRED, code: 'SIGNUP_EXPIRED' }, { status: 410 });
}

/**
 * Why app signup can't run right now, or null. Checked before any lookup, so a refusal can't say
 * whether an address has an account.
 */
export function appSignupUnavailable(): NextResponse | null {
  if (!isMedRepSelfSignupEnabled()) {
    return NextResponse.json(
      { success: false, error: 'Medical representative registration is paused.', code: 'SIGNUP_PAUSED' },
      { status: 410 }
    );
  }
  const emailReady = isEmailConfigured() || process.env.NODE_ENV !== 'production';
  if (!emailReady || !otpAvailable()) {
    logger.error('Rep app signup requested without email or SMS codes', new Error('Rep signup codes unavailable'));
    return NextResponse.json(
      { success: false, error: 'Sign-up codes can’t be sent right now. Please try again later.', code: 'CODES_UNAVAILABLE' },
      { status: 503 }
    );
  }
  return null;
}

/** A new signup id: the app keeps it; only its hash is stored. Same shape as invite tokens. */
export function newSignupId(): { id: string; hash: string } {
  const id = randomBytes(32).toString('base64url');
  return { id, hash: hashInviteToken(id) };
}

export async function newEmailCode(): Promise<{ code: string; hash: string; expiresAt: Date }> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  return {
    code,
    hash: await bcrypt.hash(code, 10),
    expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60 * 1000),
  };
}

/** The live signup for this id, or null when it is unknown or has lapsed. */
export async function findAppSignup(signupId: unknown, withCodeHash = false): Promise<IRepAppSignup | null> {
  if (!isInviteTokenFormat(signupId)) return null;
  await connectDB();
  const query = RepAppSignup.findOne({ tokenHash: hashInviteToken(signupId), expiresAt: { $gt: new Date() } });
  return withCodeHash ? query.select('+emailCodeHash') : query;
}

/** Email the 6-digit code. In development without Resend the code goes to the server log instead. */
export async function sendSignupEmailCode(email: string, firstName: string, code: string): Promise<boolean> {
  const result = await sendEmail({
    to: email,
    subject: `${code} is your MyClinicSoft Rep sign-up code`,
    html: `<p>Hi ${escapeHtml(firstName)},</p>
<p>Your code to finish signing up for MyClinicSoft Rep is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p>
<p>It expires in ${EMAIL_CODE_TTL_MINUTES} minutes. Never share this code.</p>
<p>If you didn't ask for this, you can ignore this email and nothing will happen.</p>`,
  }).catch((error) => {
    logger.error('Rep signup email code failed', error as Error);
    return { success: false, skipped: false };
  });
  if (!result.success && result.skipped && process.env.NODE_ENV !== 'production') {
    console.warn(`[dev] Rep sign-up email code for ${email}: ${code}`);
    return true;
  }
  return result.success;
}

/** Text the phone code (Twilio Verify in production, lib/otp's local provider in development). */
export function sendSignupPhoneCode(phone: string): Promise<boolean> {
  return startOtp({
    scope: 'medrep-signup',
    phone,
    message: (code, minutes) => `Your MyClinicSoft Rep sign-up code is ${code}. It expires in ${minutes} minutes. Never share this code.`,
  });
}

/** Mail to an address that already has an account: says so, and that nothing was created. */
export async function sendAlreadyRegisteredEmail(email: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Someone tried to sign up with this email',
    html: `<p>Someone tried to sign up for MyClinicSoft Rep with this email, but it already has an account, so nothing new was made.</p>
<p>If this was you, sign in instead (or reset your password). If it wasn't, you can ignore this email.</p>`,
  }).catch((error) => logger.warn('Rep signup already-registered email failed', { error: String(error) }));
}

/** Whether the activation fee is taken online; otherwise our team activates the account. */
export async function activationFeeOnline(): Promise<{ online: boolean; fee: number }> {
  const fee = (await getPlatformFees()).medrepActivationFee;
  return { online: (await isPayMongoConfigured()) && fee >= MIN_ONLINE_ACTIVATION_FEE, fee };
}

/** Public reference shown to the rep and support: MR- plus the end of the rep id. */
export function activationReference(repId: unknown): string {
  return `MR-${String(repId).slice(-8).toUpperCase()}`;
}

/**
 * A PayMongo checkout for a rep's activation fee. The payment webhook (purpose `medrep`) activates
 * the rep. PayMongo returns the browser to the web success page.
 */
export async function createActivationCheckout(options: {
  rep: { _id: unknown; firstName: string; lastName: string; company: string; email: string };
  fee: number;
  origin: string;
  /** The app's deep link (see isAllowedAppReturnUrl): the success page sends the browser back to it. */
  returnUrl?: string | null;
}): Promise<string> {
  const { rep, fee, origin } = options;
  const base = origin.replace(/\/$/, '');
  const app = options.returnUrl && isAllowedAppReturnUrl(options.returnUrl) ? `&app=${encodeURIComponent(options.returnUrl)}` : '';
  const checkout = await createCheckoutSession({
    name: 'MyClinicSoft medical representative activation',
    amount: fee,
    description: `Activation for ${rep.firstName} ${rep.lastName}, ${rep.company}`,
    referenceNumber: activationReference(rep._id),
    successUrl: `${base}/medical-representatives/onboard/success?id=${rep._id}&paid=1${app}`,
    cancelUrl: `${base}/medical-representatives/onboard/success?id=${rep._id}${app}`,
    email: rep.email,
    metadata: { purpose: 'medrep', repId: String(rep._id), amount: String(fee) },
  });
  // Kept so /onboard/app/activation can ask PayMongo directly when the webhook is late or can't
  // reach us (always the case in local development).
  await MedicalRepresentative.updateOne({ _id: rep._id }, { $set: { activationCheckoutId: checkout.id } });
  return checkout.checkoutUrl;
}

/** The site PayMongo should send the browser back to. The app has no Origin header. */
export function publicOrigin(fallback: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || fallback).replace(/\/$/, '');
}

export function isValidEmailCodeFormat(code: unknown): code is string {
  return typeof code === 'string' && EMAIL_CODE_FORMAT.test(code);
}

// ── App activation pass ──────────────────────────────────────────────────────

/** How long the app can use the pass to pay and then be signed in once the payment lands. */
export const ACTIVATION_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Give an unpaid rep, whose identity was just proven (password, texted code, or both sign-up codes),
 * a pass the app keeps: it opens a checkout without asking again, and once the payment webhook
 * activates the account it is traded for a session (POST /onboard/app/activation). A new pass
 * replaces the old one.
 */
export async function issueActivationToken(repId: unknown): Promise<{ token: string; expiresAt: Date }> {
  await connectDB();
  const { id: token, hash } = newSignupId();
  const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS);
  await MedicalRepresentative.updateOne({ _id: repId }, { $set: { activationTokenHash: hash, activationTokenExpiresAt: expiresAt } });
  return { token, expiresAt };
}

/** The rep this pass belongs to, while it lasts. */
export async function findRepByActivationToken(token: unknown) {
  if (!isInviteTokenFormat(token)) return null;
  await connectDB();
  return MedicalRepresentative.findOne({
    activationTokenHash: hashInviteToken(token),
    activationTokenExpiresAt: { $gt: new Date() },
  });
}

/** The rep app's URL scheme (clinic-management-rep app.json `scheme`). */
export const REP_APP_SCHEME = 'myclinicsoft-rep';

/**
 * Where the payment pages may send the browser back to: the rep app's own scheme, and in
 * development Expo Go's `exp://` links. Anything else would make the success page an open redirect.
 */
export function isAllowedAppReturnUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return false;
  }
  if (protocol === `${REP_APP_SCHEME}:`) return true;
  return process.env.NODE_ENV !== 'production' && (protocol === 'exp:' || protocol === 'exps:');
}
