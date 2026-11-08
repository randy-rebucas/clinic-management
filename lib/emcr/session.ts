import 'server-only';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import { emcrAccountSessionVersion, issuePatientToken, PATIENT_TOKEN_TTL_SECONDS } from '@/app/lib/dal';
import { issueRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '@/app/lib/refresh-tokens';
import { consumeOtp, OTP_EXPIRY_MINUTES, startOtp } from '@/lib/otp';
import { accountSessionSubject, type EmcrAccountLean } from '@/lib/emcr/account';
import { activationView } from '@/lib/emcr/activation';
import { fullLoginId } from '@/lib/emcr/login-id';
import { cancelClinicPassword } from '@/lib/emcr/password';

export const EMCR_OTP_EXPIRY_MINUTES = OTP_EXPIRY_MINUTES;

/**
 * Text a sign-in code to `phone`. The caller decides whether this number may get a code (on file
 * at a clinic, or named on an invite). The account is created only once the code is proven.
 */
export async function sendAccountOtp(phone: string): Promise<boolean> {
  return startOtp({
    scope: 'emcr',
    phone,
    message: (code, minutes) => `Your eMCR sign-in code is ${code}. It expires in ${minutes} minutes. Never share this code.`,
  });
}

export type AccountOtpResult =
  | { ok: true; account: EmcrAccountLean }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/** Verify and spend the code for `phone`, then return its account, created on first proof. */
export async function consumeAccountOtp(phone: string, otp: string): Promise<AccountOtpResult> {
  const result = await consumeOtp({ scope: 'emcr', phone }, otp);
  if (!result.ok) return { ok: false, reason: result.reason };

  await connectDB();
  const upsert = () =>
    EmcrAccount.findOneAndUpdate({ phone }, { $setOnInsert: { phone } }, { upsert: true, new: true }).lean<EmcrAccountLean>();
  let account: EmcrAccountLean;
  try {
    account = (await upsert()) as EmcrAccountLean;
  } catch (error) {
    // Two first sign-ins raced on the unique phone index; the other one created it.
    if ((error as { code?: number }).code !== 11000) throw error;
    account = (await upsert()) as EmcrAccountLean;
  }
  if (!account.passwordTenantId) return { ok: true, account };

  await cancelClinicPassword(account._id);
  const { passwordSetAt: _at, passwordSetBy: _by, mustChangePassword: _must, passwordTenantId: _tid, ...rest } = account;
  void [_at, _by, _must, _tid];
  return { ok: true, account: rest };
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
    // No password yet: the app asks for one right after this sign-in (POST /api/emcr/account/password).
    hasPassword: !!account.passwordSetAt,
    mustChangePassword: !!account.mustChangePassword,
    // qc01.jdc.19900425@myclinicsoft.solutions: signs in like the mobile number. Null for guardian-only accounts.
    loginId: fullLoginId(account.loginId),
    activation: activationView(account),
  };
}

/**
 * Sign the caller in on their eMCR account (the holder's record, or for a guardian-only account
 * the first record they manage). Null when the account has no profile to sign in as yet.
 * A password a clinic knows signs in to that clinic only (`tid`); see setAccountPassword.
 */
export async function accountSessionFields(
  account: EmcrAccountLean,
  amr: 'otp' | 'password' = 'otp'
): Promise<Record<string, unknown> | null> {
  const subject = await accountSessionSubject(account);
  if (!subject) return null;
  const { patient, rel } = subject;
  const acc = String(account._id);
  const tid = amr === 'password' && account.passwordTenantId ? String(account.passwordTenantId) : undefined;
  // The account's session version goes on both, so a later bump ends this guardian session.
  const av = await emcrAccountSessionVersion(acc);
  const token = await issuePatientToken(patient, { tid, amr, acc, rel, av });
  const refreshToken = await issueRefreshToken('patient', patient._id, patient.sessionVersion ?? 0, undefined, { tid, acc, rel, av });
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
