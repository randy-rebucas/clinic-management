import 'server-only';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import { maskPhone, smsCountryAllowed } from '@/lib/phone';
import OtpChallenge, { type OtpProvider, type OtpScope } from '@/models/OtpChallenge';
import { getTwilioClient, isSMSConfigured, sendSMS, smsSent } from '@/lib/sms';

/**
 * Phone codes for every flow. Production sends and checks through Twilio Verify. Development
 * defaults to `local`, which hashes a code and texts it with sendSMS, or prints it to the dev server
 * console when Twilio isn't set up. `OTP_PROVIDER` (`verify` or `local`) overrides either default;
 * in production, `local` is only a rollback.
 */

/** Verify's fixed lifetime; `local` matches it so both behave the same. */
export const OTP_EXPIRY_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;
const OTP_LENGTH = 6;
const CODE_FORMAT = /^\d{6}$/;

const TWILIO_NOT_FOUND = 404;
const TWILIO_MAX_CHECK_ATTEMPTS = 60202;

function activeProvider(): OtpProvider {
  const configured = process.env.OTP_PROVIDER;
  if (configured === 'verify' || configured === 'local') return configured;
  return process.env.NODE_ENV === 'production' ? 'verify' : 'local';
}

/**
 * Whether a code can actually go out. Callers check this before looking anyone up: refusing after
 * a lookup would reveal which numbers are on file.
 */
export function otpAvailable(): boolean {
  if (activeProvider() === 'verify') {
    return !!(process.env.TWILIO_VERIFY_SERVICE_SID && getTwilioClient());
  }
  return process.env.NODE_ENV !== 'production' || isSMSConfigured();
}

export interface StartOtpOptions {
  scope: OtpScope;
  /** E.164. */
  phone: string;
  purpose?: string;
  patientId?: Types.ObjectId | string;
  tenantId?: Types.ObjectId | string;
  /** The text for the `local` provider. Verify uses its own template. */
  message: (code: string, expiryMinutes: number) => string;
}

/** Create the challenge and send the code. False when it couldn't be sent; the caller decides what to say. */
export async function startOtp(options: StartOtpOptions): Promise<boolean> {
  // Covers the Twilio Verify path too, which doesn't go through sendSMS.
  if (!smsCountryAllowed(options.phone)) return false;
  await connectDB();
  const provider = activeProvider();
  const code = provider === 'local' ? randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0') : null;

  const set: Record<string, unknown> = {
    provider,
    attempts: 0,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
  };
  const unset: Record<string, 1> = {};
  const optional = {
    purpose: options.purpose,
    patientId: options.patientId,
    tenantId: options.tenantId,
    codeHash: code ? await bcrypt.hash(code, 10) : undefined,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value === undefined) unset[key] = 1;
    else set[key] = value;
  }

  await OtpChallenge.updateOne(
    { scope: options.scope, phoneE164: options.phone },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { upsert: true }
  );

  if (code === null) return sendWithVerify(options.phone);

  const sms = await sendSMS({
    to: options.phone,
    message: options.message(code, OTP_EXPIRY_MINUTES),
    tenantId: null,
    category: 'auth',
    template: `otp-${options.scope}`,
  });
  if (sms.skipped && process.env.NODE_ENV !== 'production') {
    console.warn(`[dev] Code for ${maskPhone(options.phone)}: ${code}`);
    return true;
  }
  if (!smsSent(sms)) logger.error('Failed to send a phone code', new Error(sms.error ?? 'SMS not sent'), { scope: options.scope });
  return smsSent(sms);
}

/**
 * A challenge no code can pass, sent to no one: for a number with no account, so checking a code
 * for it answers exactly as for a real one (wrong, then locked after MAX_OTP_ATTEMPTS, then
 * expired). Without it, "no challenge" would tell anyone which numbers are on file.
 */
export async function startDecoyOtp(options: Pick<StartOtpOptions, 'scope' | 'phone'>): Promise<void> {
  await connectDB();
  // A bcrypt hash of a random non-numeric secret: no 6-digit code ever matches it.
  const codeHash = await bcrypt.hash(`decoy:${randomInt(0, 2 ** 47)}:${Date.now()}`, 10);
  await OtpChallenge.updateOne(
    { scope: options.scope, phoneE164: options.phone },
    {
      $set: { provider: 'local', attempts: 0, codeHash, expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000) },
      $unset: { purpose: 1, patientId: 1, tenantId: 1 },
    },
    { upsert: true }
  );
}

async function sendWithVerify(phone: string): Promise<boolean> {
  try {
    await verifyService().verifications.create({ to: phone, channel: 'sms' });
    return true;
  } catch (error) {
    logger.error('Twilio Verify could not send a code', error as Error);
    return false;
  }
}

function verifyService() {
  const client = getTwilioClient();
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!client || !sid) throw new Error('Twilio Verify is not configured');
  return client.verify.v2.services(sid);
}

export type OtpSelector =
  | { scope: OtpScope; phone: string; purpose?: string; tenantId?: Types.ObjectId | string }
  | { scope: OtpScope; patientId: Types.ObjectId | string };

export type OtpFailure = 'invalid' | 'expired' | 'locked';

export type ConsumeOtpResult =
  | { ok: true; phone: string; patientId?: Types.ObjectId }
  /** `noChallenge`: nothing was pending for this selector, so nothing was spent. */
  | { ok: false; reason: OtpFailure; noChallenge?: boolean };

function challengeFilter(selector: OtpSelector): Record<string, unknown> {
  if ('patientId' in selector) return { scope: selector.scope, patientId: new Types.ObjectId(String(selector.patientId)) };
  const filter: Record<string, unknown> = { scope: selector.scope, phoneE164: selector.phone };
  if (selector.purpose) filter.purpose = selector.purpose;
  if (selector.tenantId) filter.tenantId = new Types.ObjectId(String(selector.tenantId));
  return filter;
}

/** Twilio's answer for a code: right, wrong, or the verification is over. Network faults throw. */
async function checkWithVerify(phone: string, code: string): Promise<'approved' | OtpFailure> {
  try {
    const check = await verifyService().verificationChecks.create({ to: phone, code });
    if (check.status === 'approved') return 'approved';
    return check.status === 'max_attempts_reached' ? 'locked' : 'invalid';
  } catch (error) {
    const { status, code: twilioCode } = error as { status?: number; code?: number };
    if (twilioCode === TWILIO_MAX_CHECK_ATTEMPTS) return 'locked';
    if (status === TWILIO_NOT_FOUND) return 'expired';
    throw error;
  }
}

/**
 * Check and spend a code. The attempt counter is checked and raised in one update, so parallel
 * guesses can't exceed MAX_OTP_ATTEMPTS, and the delete spends a right code exactly once.
 */
export async function consumeOtp(selector: OtpSelector, code: string): Promise<ConsumeOtpResult> {
  if (!CODE_FORMAT.test(code)) return { ok: false, reason: 'invalid' };
  await connectDB();
  const filter = challengeFilter(selector);
  const now = new Date();

  const challenge = await OtpChallenge.findOneAndUpdate(
    { ...filter, expiresAt: { $gt: now }, attempts: { $lt: MAX_OTP_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true, sort: { updatedAt: -1 } }
  ).select('+codeHash');

  if (!challenge) {
    // Only picks the message; nothing is granted from this read.
    const spent = await OtpChallenge.findOneAndDelete(filter, { sort: { updatedAt: -1 } }).select('attempts');
    if (!spent) return { ok: false, reason: 'invalid', noChallenge: true };
    return { ok: false, reason: spent.attempts >= MAX_OTP_ATTEMPTS ? 'locked' : 'expired' };
  }

  const answer =
    challenge.provider === 'verify'
      ? await checkWithVerify(challenge.phoneE164, code)
      : (await bcrypt.compare(code, challenge.codeHash as string))
        ? 'approved'
        : 'invalid';

  if (answer === 'invalid') return { ok: false, reason: 'invalid' };

  const deleted = await OtpChallenge.findOneAndDelete({ _id: challenge._id, attempts: challenge.attempts });
  if (answer !== 'approved') return { ok: false, reason: answer };
  // A parallel request got here first, or a newer code replaced this one.
  if (!deleted) return { ok: false, reason: 'invalid' };
  return { ok: true, phone: challenge.phoneE164, patientId: challenge.patientId };
}
