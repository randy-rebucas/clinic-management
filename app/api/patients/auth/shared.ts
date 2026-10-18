import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { issuePatientToken, revokePatientSessions, setPatientSessionCookie } from '@/app/lib/dal';
import { issueRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '@/app/lib/refresh-tokens';

export const MAX_OTP_ATTEMPTS = 5;

let dummyHash: string | null = null;
/** Valid bcrypt hash compared when no account matches, so timing does not reveal existence. */
export function dummyPasswordHash(): string {
  if (!dummyHash) dummyHash = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
  return dummyHash;
}
export const LOGIN_QR_TTL_DAYS = 30;

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

export function phoneFilter(phone: string) {
  return { $or: [{ phone }, { 'contacts.phone': phone }] };
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
export async function patientLoginResponse(patient: any): Promise<NextResponse> {
  const token = await issuePatientToken(patient);
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

/** The active patient a login QR token belongs to, or null when invalid/expired. */
export async function findPatientByLoginQr(token: string) {
  await connectDB();
  return Patient.findOne({
    loginQrTokenHash: hashLoginQrToken(token),
    loginQrTokenExpiry: { $gt: new Date() },
    active: { $ne: false },
  });
}

/**
 * Issue a new login QR for a patient. The QR carries a random 256-bit token; only its
 * SHA-256 is stored. Issuing a new one revokes the previous QR.
 * Returns the string to encode in the QR image.
 */
export async function issuePatientLoginQr(patientId: string | Types.ObjectId): Promise<{ qrData: string; expiresAt: Date }> {
  await connectDB();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + LOGIN_QR_TTL_DAYS * 24 * 60 * 60 * 1000);
  await Patient.updateOne(
    { _id: patientId },
    { $set: { loginQrTokenHash: hashLoginQrToken(token), loginQrTokenExpiry: expiresAt } }
  );
  return { qrData: JSON.stringify({ type: 'patient_login', token }), expiresAt };
}

/** Revoke the patient's login QR (e.g. after a password change or on request). */
export async function revokePatientLoginQr(patientId: string | Types.ObjectId): Promise<void> {
  await connectDB();
  await Patient.updateOne({ _id: patientId }, { $unset: { loginQrTokenHash: 1, loginQrTokenExpiry: 1 } });
}

/**
 * After a patient password change: revoke every existing patient token and the login QR,
 * then return a fresh token for the caller so their current session keeps working.
 * Sets the cookie when the caller used one; otherwise returns the token for the body.
 */
export async function rotatePatientSessionAfterPasswordChange(
  request: NextRequest,
  patientId: string
): Promise<{
  apply: (response: NextResponse) => NextResponse;
  token: string | null;
  /** Fields for the JSON body of a Bearer caller: the new token and refresh token. */
  bodyFields: Record<string, unknown>;
}> {
  await revokePatientSessions(patientId);
  await revokePatientLoginQr(patientId);
  const patient = await Patient.findById(patientId).select('patientCode email sessionVersion');
  if (!patient) return { apply: (r) => r, token: null, bodyFields: {} };

  const token = await issuePatientToken(patient);
  const usedCookie = !!request.cookies.get('patient_session')?.value;
  // Old refresh tokens die with the session version bump; the app gets a new one.
  const refreshToken = usedCookie
    ? null
    : await issueRefreshToken('patient', patient._id, patient.sessionVersion ?? 0);
  return {
    token: usedCookie ? null : token,
    bodyFields: usedCookie
      ? {}
      : { token, tokenType: 'Bearer', refreshToken, refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS },
    apply: (response) => {
      if (usedCookie) setPatientSessionCookie(response, token);
      return response;
    },
  };
}
