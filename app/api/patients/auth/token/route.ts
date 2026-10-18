import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import logger from '@/lib/logger';
import { applyAuthRateLimits, applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { issuePatientToken, PATIENT_TOKEN_TTL_SECONDS, type PatientTokenClaims } from '@/app/lib/dal';
import { issueRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '@/app/lib/refresh-tokens';
import { linkRecordsByVerifiedPhone } from '../../me/_lib/linked-records';
import {
  authenticatePatientPassword,
  consumePatientOtp,
  invalidTenantResponse,
  otpFailureResponse,
  parseOptionalTenantId,
  phoneFilter,
  phoneRateKey,
  readLoginQrToken,
  redeemPatientLoginQr,
} from '../shared';

/**
 * POST /api/patients/auth/token
 *
 * Issues a Bearer token for use in third-party / mobile applications.
 * Unlike the browser login endpoints, this returns the JWT in the
 * response body instead of (or in addition to) setting a cookie.
 *
 * Supported methods (via the `method` field):
 *
 *   method: "password"
 *     { method, email, password, tenantId? }
 *     → email + password credential login
 *
 *   method: "otp"
 *     { method, phone, otp, tenantId? }
 *     → phone OTP login (call POST /api/patients/auth/otp/request first)
 *
 *   method: "qr"
 *     { method, qrCode }
 *     → scanned login QR ('{"type":"patient_login","token":"..."}'), issued by clinic staff
 *       (POST /api/patients/[id]/login-qr) or by POST /api/patients/me/login-qr. A QR works
 *       once and expires 15 minutes after it is issued.
 *
 * The returned token is an HS256 JWT with the same payload shape as the
 * patient_session cookie, so every /api/patients/me/* endpoint accepts it
 * via the Authorization: Bearer header. Tokens live 7 days (`expiresIn`); the
 * `refreshToken` (60 days, single use) gets a new pair from POST /api/patients/auth/refresh. Both
 * are revoked when the patient changes their password.
 *
 * Claims: `amr` ("password" | "otp" | "qr") says how the sign-in was proven. `tid` (a clinic id)
 * is present when the credential came from one clinic's staff (staff login QR, staff-set
 * password): that session only sees that clinic's records. Refreshed tokens keep `tid`.
 *
 * Rate-limited per IP and per account.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request format' },
      { status: 400 }
    );
  }

  const method = typeof body.method === 'string' ? body.method : '';

  if (method === 'password') {
    return handlePasswordLogin(request, body);
  }

  if (method === 'otp') {
    return handleOtpLogin(request, body);
  }

  if (method === 'qr') {
    return handleQrLogin(request, body);
  }

  return NextResponse.json(
    {
      success: false,
      error: 'Invalid method. Use "password", "otp" or "qr".',
      validMethods: ['password', 'otp', 'qr'],
    },
    { status: 400 }
  );
}

// ── Login QR ──────────────────────────────────────────────────────────────────

async function handleQrLogin(request: NextRequest, body: Record<string, unknown>): Promise<NextResponse> {
  const limited = await applyRateLimit(request, rateLimiters.auth);
  if (limited) return limited;

  const qrToken = readLoginQrToken(body.qrCode);
  if (!qrToken) {
    return NextResponse.json(
      { success: false, error: 'This QR code is not valid for login. Please ask the clinic for a new one or sign in another way.' },
      { status: 400 }
    );
  }

  try {
    const redeemed = await redeemPatientLoginQr(qrToken);
    if (!redeemed) {
      return NextResponse.json(
        { success: false, error: 'This QR code is invalid, has expired or was already used.' },
        { status: 401 }
      );
    }

    const { patient, tid } = redeemed;
    logger.info('Patient Bearer token issued (QR)', { patientId: patient._id.toString(), scoped: !!tid });
    return await tokenResponse(patient, { tid, amr: 'qr' });
  } catch (error: any) {
    logger.error('Error in patient token (QR)', error as Error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ── Email + password ──────────────────────────────────────────────────────────

async function handlePasswordLogin(request: NextRequest, body: Record<string, unknown>): Promise<NextResponse> {
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const tenant = parseOptionalTenantId(body.tenantId);
  if (!tenant.ok) return invalidTenantResponse();

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: 'email and password are required' },
      { status: 400 }
    );
  }

  const limited = await applyAuthRateLimits(request, `patient-login:${email}`);
  if (limited) return limited;

  try {
    const result = await authenticatePatientPassword(email, password, tenant.tenantId);
    if (!result.ok && result.reason === 'invalid') {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!result.ok) {
      await recordPatientRefused(result.patient as any, request, 'sign-in');
      return NextResponse.json(
        { success: false, error: 'Account is inactive. Please contact the clinic.', code: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    const { patient, tid } = result;
    logger.info('Patient Bearer token issued (password)', { patientId: patient._id.toString(), scoped: !!tid });
    return await tokenResponse(patient, { tid, amr: 'password' });
  } catch (error: any) {
    logger.error('Error in patient token (password)', error as Error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ── Phone OTP ─────────────────────────────────────────────────────────────────

async function handleOtpLogin(request: NextRequest, body: Record<string, unknown>): Promise<NextResponse> {
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  const tenant = parseOptionalTenantId(body.tenantId);
  if (!tenant.ok) return invalidTenantResponse();

  if (!phone || !otp) {
    return NextResponse.json(
      { success: false, error: 'phone and otp are required' },
      { status: 400 }
    );
  }

  const limited = await applyAuthRateLimits(request, phoneRateKey(phone));
  if (limited) return limited;

  try {
    const filter: Record<string, unknown> = phoneFilter(phone);
    if (tenant.tenantId) filter.tenantIds = tenant.tenantId;

    const result = await consumePatientOtp(filter, otp);
    if (!result.ok) return otpFailureResponse(result.reason);

    // The phone is now proven: join this person's records at other clinics to this login.
    await linkRecordsByVerifiedPhone(result.patient._id.toString(), phone).catch((error) =>
      logger.error('Linking patient records by phone failed', error as Error, { patientId: result.patient._id.toString() })
    );

    logger.info('Patient Bearer token issued (OTP)', { patientId: result.patient._id.toString() });
    // An OTP proves the patient's own phone: the session is not limited to one clinic.
    return await tokenResponse(result.patient, { amr: 'otp' });
  } catch (error: any) {
    logger.error('Error in patient token (OTP)', error as Error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function tokenResponse(patient: any, claims: PatientTokenClaims): Promise<NextResponse> {
  const token = await issuePatientToken(patient, claims);
  const refreshToken = await issueRefreshToken('patient', patient._id, patient.sessionVersion ?? 0, undefined, {
    tid: claims.tid,
  });
  return NextResponse.json({
    success: true,
    message: 'Authentication successful',
    token,
    tokenType: 'Bearer',
    expiresIn: PATIENT_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    patient: {
      id: patient._id.toString(),
      patientCode: patient.patientCode ?? null,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email ?? null,
    },
  });
}
