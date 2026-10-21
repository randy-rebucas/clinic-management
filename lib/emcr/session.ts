import 'server-only';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import { issuePatientToken, PATIENT_TOKEN_TTL_SECONDS } from '@/app/lib/dal';
import { issueRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '@/app/lib/refresh-tokens';
import { MAX_OTP_ATTEMPTS } from '@/app/api/patients/auth/shared';
import { accountSessionSubject, type EmcrAccountLean } from '@/lib/emcr/account';
import { activationView } from '@/lib/emcr/activation';

export const EMCR_OTP_EXPIRY_MINUTES = 5;
const OTP_LENGTH = 6;

export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

export type AccountOtpResult =
  | { ok: true; account: EmcrAccountLean }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/**
 * Verify and spend the account's OTP, as consumePatientOtp: the attempt counter is checked and
 * raised in one update, and a right code is spent once.
 */
export async function consumeAccountOtp(phone: string, otp: string): Promise<AccountOtpResult> {
  await connectDB();
  const now = new Date();
  const account = await EmcrAccount.findOneAndUpdate(
    { phone, otp: { $exists: true, $ne: null }, otpExpiry: { $gt: now }, otpAttempts: { $lt: MAX_OTP_ATTEMPTS } },
    { $inc: { otpAttempts: 1 } },
    { new: true }
  ).select('+otp');

  if (!account) {
    const current = await EmcrAccount.findOne({ phone, otp: { $exists: true, $ne: null } })
      .select('otpExpiry otpAttempts')
      .lean<{ _id: unknown; otpExpiry?: Date; otpAttempts?: number } | null>();
    if (!current) return { ok: false, reason: 'invalid' };
    if ((current.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS || !current.otpExpiry || current.otpExpiry <= now) {
      await EmcrAccount.updateOne({ _id: current._id }, { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } });
      return { ok: false, reason: (current.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS ? 'locked' : 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }

  const storedHash = account.otp as string;
  if (!(await bcrypt.compare(otp, storedHash))) return { ok: false, reason: 'invalid' };
  const spent = await EmcrAccount.updateOne(
    { _id: account._id, otp: storedHash },
    { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
  );
  if (spent.modifiedCount !== 1) return { ok: false, reason: 'invalid' };
  return { ok: true, account: account.toObject() as EmcrAccountLean };
}

/** What the app shows about the account: who it is signed in as, activation, open requests. */
export async function accountView(account: EmcrAccountLean) {
  await connectDB();
  const pendingRequests = await EmcrAccessRequest.countDocuments({ accountId: account._id, status: 'pending' });
  return {
    id: String(account._id),
    hasOwnRecord: !!account.selfPatientId,
    // A fresh sign-in on an account without its own record is a guardian session.
    guardianOnly: !account.selfPatientId,
    pendingRequests,
    activation: activationView(account),
  };
}

/**
 * Sign the caller in on their eMCR account (the holder's record, or for a guardian-only account
 * the first record they manage). Null when the account has no profile to sign in as yet.
 */
export async function accountSessionFields(account: EmcrAccountLean): Promise<Record<string, unknown> | null> {
  const subject = await accountSessionSubject(account);
  if (!subject) return null;
  const { patient, rel } = subject;
  const acc = String(account._id);
  const token = await issuePatientToken(patient, { amr: 'otp', acc, rel });
  const refreshToken = await issueRefreshToken('patient', patient._id, patient.sessionVersion ?? 0, undefined, { acc, rel });
  return {
    token,
    tokenType: 'Bearer',
    expiresIn: PATIENT_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    guardianOnly: rel === 'guardian',
    patient: {
      id: patient._id.toString(),
      patientCode: patient.patientCode ?? null,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email ?? null,
    },
  };
}

export function otpFailure(reason: 'invalid' | 'expired' | 'locked') {
  if (reason === 'locked') {
    return NextResponse.json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' }, { status: 429 });
  }
  if (reason === 'expired') {
    return NextResponse.json({ success: false, error: 'The code has expired. Please request a new one.' }, { status: 401 });
  }
  return NextResponse.json({ success: false, error: 'Invalid or expired code' }, { status: 401 });
}
