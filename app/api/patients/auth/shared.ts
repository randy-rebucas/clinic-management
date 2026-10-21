import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import MobileDevice from '@/models/MobileDevice';
import { normalizePhone } from '@/lib/phone';
import {
  isFreshOtpSession,
  issuePatientToken,
  PATIENT_TOKEN_TTL_SECONDS,
  revokePatientSessions,
  setPatientSessionCookie,
  type PatientSessionPayload,
  type PatientTokenClaims,
} from '@/app/lib/dal';
import { issueRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '@/app/lib/refresh-tokens';

export const MAX_OTP_ATTEMPTS = 5;

let dummyHash: string | null = null;
/** Valid bcrypt hash compared when no account matches, so timing does not reveal existence. */
export function dummyPasswordHash(): string {
  if (!dummyHash) dummyHash = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
  return dummyHash;
}
/** Login QRs are single-use and short-lived: shown at the desk (or on a phone) and scanned right away. */
export const LOGIN_QR_TTL_MINUTES = 15;

/** Upper bound on patient records sharing one login email that a sign-in will try. */
const MAX_EMAIL_LOGIN_CANDIDATES = 5;

/**
 * Parse an optional tenantId from an unauthenticated login body. It only narrows which
 * clinic's patient record is matched; it never grants access by itself.
 */
export function parseOptionalTenantId(value: unknown): { ok: true; tenantId?: Types.ObjectId } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true };
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value.trim())) return { ok: false };
  return { ok: true, tenantId: new Types.ObjectId(value.trim()) };
}

export function invalidTenantResponse() {
  return NextResponse.json({ success: false, error: 'Invalid tenantId' }, { status: 400 });
}

/** "+639171234567" → "+63*******4567" — never log full phone numbers. */
export function maskPhone(phone: string): string {
  const raw = phone.replace(/\s/g, '');
  if (raw.length <= 6) return '****';
  return raw.slice(0, 3) + '*'.repeat(raw.length - 7) + raw.slice(-4);
}

/**
 * Spellings a stored phone number may have for the number the patient typed: as typed, E.164
 * (+639171234567), E.164 without "+", and the local forms (09171234567 / 9171234567) for
 * Philippine numbers. Stored data is not normalized, so all are matched.
 */
export function phoneVariants(phone: string): string[] {
  const raw = phone.trim();
  const variants = new Set<string>([raw]);
  const e164 = normalizePhone(raw);
  if (e164) {
    variants.add(e164);
    variants.add(e164.slice(1));
    if (e164.startsWith('+63')) {
      variants.add(`0${e164.slice(3)}`);
      variants.add(e164.slice(3));
    }
  }
  return [...variants].filter(Boolean);
}

export function phoneFilter(phone: string) {
  const variants = phoneVariants(phone);
  return { $or: [{ phone: { $in: variants } }, { 'contacts.phone': { $in: variants } }] };
}

/** Rate-limit key for a phone number, so "0917…" and "+63917…" share one bucket. */
export function phoneRateKey(phone: string): string {
  return `otp:${normalizePhone(phone) ?? phone.trim()}`;
}

export type OtpResult =
  | { ok: true; patient: any }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/**
 * Verify and consume a patient OTP. The attempt counter is checked and incremented in a
 * single conditional update, so parallel guesses cannot exceed MAX_OTP_ATTEMPTS, and a
 * correct code can be redeemed only once.
 */
export async function consumePatientOtp(filter: Record<string, unknown>, otp: string): Promise<OtpResult> {
  await connectDB();
  const now = new Date();

  const patient = await Patient.findOneAndUpdate(
    {
      ...filter,
      active: { $ne: false },
      otp: { $exists: true, $ne: null },
      otpExpiry: { $gt: now },
      otpAttempts: { $lt: MAX_OTP_ATTEMPTS },
    },
    { $inc: { otpAttempts: 1 } },
    { new: true }
  ).select('+otp');

  if (!patient) {
    // Only used to pick an error message; nothing is granted from this read.
    const current = await Patient.findOne({ ...filter, otp: { $exists: true, $ne: null } })
      .select('otpExpiry otpAttempts')
      .lean<{ _id: Types.ObjectId; otpExpiry?: Date; otpAttempts?: number } | null>();
    if (!current) return { ok: false, reason: 'invalid' };
    if ((current.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS || !current.otpExpiry || current.otpExpiry <= now) {
      await Patient.updateOne(
        { _id: current._id },
        { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
      );
      return { ok: false, reason: (current.otpAttempts ?? 0) >= MAX_OTP_ATTEMPTS ? 'locked' : 'expired' };
    }
    return { ok: false, reason: 'invalid' };
  }

  const storedHash = patient.otp as string;
  const match = await bcrypt.compare(otp, storedHash);
  if (!match) return { ok: false, reason: 'invalid' };

  const consumed = await Patient.updateOne(
    { _id: patient._id, otp: storedHash },
    { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
  );
  if (consumed.modifiedCount !== 1) return { ok: false, reason: 'invalid' };

  return { ok: true, patient };
}

export function otpFailureResponse(reason: 'invalid' | 'expired' | 'locked') {
  if (reason === 'locked') {
    return NextResponse.json(
      { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' },
      { status: 429 }
    );
  }
  if (reason === 'expired') {
    return NextResponse.json(
      { success: false, error: 'OTP has expired. Please request a new one.' },
      { status: 401 }
    );
  }
  return NextResponse.json({ success: false, error: 'Invalid or expired OTP' }, { status: 401 });
}

/** Build the standard browser-login response and attach the patient_session cookie. */
export async function patientLoginResponse(patient: any, claims: PatientTokenClaims = {}): Promise<NextResponse> {
  const token = await issuePatientToken(patient, claims);
  const response = NextResponse.json({
    success: true,
    data: {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
    },
    message: 'Login successful',
  });
  setPatientSessionCookie(response, token);
  return response;
}

export function hashLoginQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const LOGIN_QR_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43,128}$/;

/** Read the login token from scanned QR data ('{"type":"patient_login","token":"..."}'), or null. */
export function readLoginQrToken(qrCode: unknown): string | null {
  let data: unknown = qrCode;
  if (typeof qrCode === 'string') {
    try {
      data = JSON.parse(qrCode);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const { type, token } = data as Record<string, unknown>;
  if (type !== 'patient_login' || typeof token !== 'string' || !LOGIN_QR_TOKEN_FORMAT.test(token)) return null;
  return token;
}

/**
 * Redeem a login QR: single use. The matching hash is cleared in the same atomic update that
 * finds the patient, so two scans of one QR can't both sign in. Returns the patient and the
 * clinic scope (`tid`) the QR was issued with, or null when invalid / expired / already used.
 */
export async function redeemPatientLoginQr(token: string): Promise<{ patient: any; tid?: string } | null> {
  await connectDB();
  const patient = await Patient.findOneAndUpdate(
    {
      loginQrTokenHash: hashLoginQrToken(token),
      loginQrTokenExpiry: { $gt: new Date() },
      active: { $ne: false },
    },
    { $unset: { loginQrTokenHash: 1, loginQrTokenExpiry: 1, loginQrTenantId: 1 } },
    // The pre-update document: it still carries loginQrTenantId.
    {
      new: false,
      projection: { patientCode: 1, firstName: 1, lastName: 1, email: 1, sessionVersion: 1, loginQrTenantId: 1 },
    }
  );
  if (!patient) return null;
  const tid = patient.loginQrTenantId ? String(patient.loginQrTenantId) : undefined;
  return { patient, tid };
}

/**
 * Issue a new login QR for a patient. The QR carries a random 256-bit token; only its
 * SHA-256 is stored. Issuing a new one revokes the previous (unused) QR. It works once and
 * expires after LOGIN_QR_TTL_MINUTES. `tenantId` scopes sessions started from it to one clinic.
 * Returns the string to encode in the QR image.
 */
export async function issuePatientLoginQr(
  patientId: string | Types.ObjectId,
  options: { tenantId?: string | Types.ObjectId | null } = {}
): Promise<{ qrData: string; expiresAt: Date }> {
  await connectDB();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + LOGIN_QR_TTL_MINUTES * 60 * 1000);
  const set: Record<string, unknown> = { loginQrTokenHash: hashLoginQrToken(token), loginQrTokenExpiry: expiresAt };
  const update: Record<string, unknown> = { $set: set };
  if (options.tenantId) set.loginQrTenantId = new Types.ObjectId(String(options.tenantId));
  else update.$unset = { loginQrTenantId: 1 };
  await Patient.updateOne({ _id: patientId }, update);
  return { qrData: JSON.stringify({ type: 'patient_login', token }), expiresAt };
}

/** Clear the patient's login QR (sessions already started from it are not touched). */
export async function revokePatientLoginQr(patientId: string | Types.ObjectId): Promise<void> {
  await connectDB();
  await Patient.updateOne(
    { _id: patientId },
    { $unset: { loginQrTokenHash: 1, loginQrTokenExpiry: 1, loginQrTenantId: 1 } }
  );
}

/**
 * Revoke everything that lets a device act as this patient: every access/refresh token
 * (session version bump), the login QR, and push registrations (a signed-out phone must stop
 * receiving notifications). `keepDeviceId` keeps the caller's own push registration when the
 * caller immediately gets a fresh token (password change).
 */
export async function revokeAllPatientAccess(
  patientId: string,
  options: { keepDeviceId?: string } = {}
): Promise<void> {
  await revokePatientSessions(patientId);
  await revokePatientLoginQr(patientId);
  const filter: Record<string, unknown> = { patientId: new Types.ObjectId(patientId), revokedAt: null };
  if (options.keepDeviceId) filter.deviceId = { $ne: options.keepDeviceId };
  await MobileDevice.updateMany(filter, { $set: { revokedAt: new Date(), pushToken: null } });
}

export type PasswordAuthResult =
  | { ok: true; patient: any; tid?: string }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'inactive'; patient: any };

/**
 * Email + password sign-in. One email can sit on several patient records (families share an
 * email; a record may exist in several clinics), so every record with that email and a password
 * is tried, up to a small cap. When none has a password, a dummy hash is compared so timing does
 * not reveal whether the email exists. A staff-set password yields a session scoped to the
 * clinic that set it.
 */
export async function authenticatePatientPassword(
  email: string,
  password: string,
  tenantId?: Types.ObjectId
): Promise<PasswordAuthResult> {
  await connectDB();
  const query: Record<string, unknown> = { email, password: { $exists: true, $nin: [null, ''] } };
  if (tenantId) query.tenantIds = tenantId;

  const candidates = await Patient.find(query)
    .select('+password +passwordTenantId')
    .sort({ active: -1, updatedAt: -1 })
    .limit(MAX_EMAIL_LOGIN_CANDIDATES);

  if (!candidates.length) {
    await bcrypt.compare(password, dummyPasswordHash());
    return { ok: false, reason: 'invalid' };
  }

  let inactiveMatch: any = null;
  for (const candidate of candidates) {
    if (!(await bcrypt.compare(password, candidate.password as string))) continue;
    if (candidate.active === false) {
      inactiveMatch = inactiveMatch ?? candidate;
      continue;
    }
    const tid = candidate.passwordTenantId ? String(candidate.passwordTenantId) : undefined;
    return { ok: true, patient: candidate, tid };
  }
  return inactiveMatch ? { ok: false, reason: 'inactive', patient: inactiveMatch } : { ok: false, reason: 'invalid' };
}

/** True when another patient already signs in with this email (has it and a password). */
export async function emailUsedForLoginByOtherPatient(
  email: string,
  patientId: string | Types.ObjectId
): Promise<boolean> {
  await connectDB();
  const conflict = await Patient.exists({
    email,
    _id: { $ne: new Types.ObjectId(String(patientId)) },
    password: { $exists: true, $nin: [null, ''] },
  });
  return !!conflict;
}

export type PhoneProof =
  | { ok: true; proven: boolean }
  | { ok: false; reason: 'invalid' | 'expired' | 'locked' };

/**
 * Proof the caller controls the patient's phone: a token from an OTP sign-in in the last
 * 15 minutes, or a fresh code (from POST /api/patients/auth/otp/request) sent as `otp`.
 * `proven: false` means no proof was offered.
 */
export async function checkPhoneProof(session: PatientSessionPayload, otp: unknown): Promise<PhoneProof> {
  if (isFreshOtpSession(session)) return { ok: true, proven: true };
  if (typeof otp !== 'string' || !otp.trim()) return { ok: true, proven: false };
  const result = await consumePatientOtp({ _id: new Types.ObjectId(session.patientId) }, otp.trim());
  return result.ok ? { ok: true, proven: true } : { ok: false, reason: result.reason };
}

export function otpRequiredResponse() {
  return NextResponse.json(
    {
      success: false,
      code: 'OTP_REQUIRED',
      error: 'To confirm it is you, sign in with a code sent to your phone (or send that code as "otp"), then try again.',
    },
    { status: 400 }
  );
}

/**
 * After a patient password change: revoke every existing patient token, the login QR and other
 * devices' push registrations, then return a fresh token for the caller so their current session
 * keeps working. Sets the cookie when the caller used one; otherwise returns the token for the body.
 * `tid` is the clinic scope the fresh token keeps (the caller's, unless they proved their phone).
 */
export async function rotatePatientSessionAfterPasswordChange(
  request: NextRequest,
  patientId: string,
  options: {
    tid?: string;
    keepDeviceId?: string;
    amr?: PatientTokenClaims['amr'] | null;
    /** eMCR account the caller's session belongs to; kept on the fresh token. */
    acc?: string;
  } = {}
): Promise<{
  apply: (response: NextResponse) => NextResponse;
  token: string | null;
  /** Fields for the JSON body of a Bearer caller: the new token and refresh token. */
  bodyFields: Record<string, unknown>;
}> {
  await revokeAllPatientAccess(patientId, { keepDeviceId: options.keepDeviceId });
  const patient = await Patient.findById(patientId).select('patientCode email sessionVersion');
  if (!patient) return { apply: (r) => r, token: null, bodyFields: {} };

  const amr = options.amr === undefined ? 'password' : options.amr ?? undefined;
  const token = await issuePatientToken(patient, { tid: options.tid, amr, acc: options.acc });
  const usedCookie = !!request.cookies.get('patient_session')?.value;
  // Old refresh tokens die with the session version bump; the app gets a new one.
  const refreshToken = usedCookie
    ? null
    : await issueRefreshToken('patient', patient._id, patient.sessionVersion ?? 0, undefined, { tid: options.tid, acc: options.acc });
  return {
    token: usedCookie ? null : token,
    bodyFields: usedCookie
      ? {}
      : {
          token,
          tokenType: 'Bearer',
          expiresIn: PATIENT_TOKEN_TTL_SECONDS,
          refreshToken,
          refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
        },
    apply: (response) => {
      if (usedCookie) setPatientSessionCookie(response, token);
      return response;
    },
  };
}
