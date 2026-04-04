import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { Types } from 'mongoose';

const TOKEN_TTL = '30d'; // third-party tokens live longer than browser sessions
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

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
 * The returned token is an HS256 JWT with the same payload shape as the
 * patient_session cookie, so every /api/patients/me/* endpoint accepts it
 * via the Authorization: Bearer header.
 *
 * Rate-limited: 5 requests per 15 minutes per IP (auth limiter).
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) return rateLimitResponse;

  let body: Record<string, any>;
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
    return handlePasswordLogin(body);
  }

  if (method === 'otp') {
    return handleOtpLogin(body);
  }

  return NextResponse.json(
    {
      success: false,
      error: 'Invalid method. Use "password" or "otp".',
      validMethods: ['password', 'otp'],
    },
    { status: 400 }
  );
}

// ── Email + password ──────────────────────────────────────────────────────────

async function handlePasswordLogin(body: Record<string, any>): Promise<NextResponse> {
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined;

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: 'email and password are required' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const query: any = { email };
    if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

    const patient = await Patient.findOne(query).select('+password');

    const credentialError = NextResponse.json(
      { success: false, error: 'Invalid email or password' },
      { status: 401 }
    );

    if (!patient) return credentialError;

    if (!patient.password) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This account has no password set. Use "otp" method or set credentials at /api/patients/auth/setup-credentials.',
          code: 'NO_PASSWORD',
        },
        { status: 401 }
      );
    }

    const match = await bcrypt.compare(password, patient.password);
    if (!match) return credentialError;

    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'Account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    const token = await issueToken(patient);
    logger.info('Patient Bearer token issued (password)', { patientId: patient._id.toString() });
    return tokenResponse(token, patient);
  } catch (error: any) {
    logger.error('Error in patient token (password)', error as Error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ── Phone OTP ─────────────────────────────────────────────────────────────────

async function handleOtpLogin(body: Record<string, any>): Promise<NextResponse> {
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined;

  if (!phone || !otp) {
    return NextResponse.json(
      { success: false, error: 'phone and otp are required' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const query: any = { $or: [{ phone }, { 'contacts.phone': phone }] };
    if (tenantId) query.tenantIds = new Types.ObjectId(tenantId);

    const patient = await Patient.findOne(query).select('+otp +otpExpiry +otpAttempts');

    const invalidError = NextResponse.json(
      { success: false, error: 'Invalid or expired OTP' },
      { status: 401 }
    );

    if (!patient || patient.active === false) return invalidError;
    if (!patient.otp || !patient.otpExpiry) return invalidError;

    if (new Date() > patient.otpExpiry) {
      await Patient.updateOne(
        { _id: patient._id },
        { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
      );
      return NextResponse.json(
        { success: false, error: 'OTP has expired. Please request a new one.' },
        { status: 401 }
      );
    }

    const attempts = patient.otpAttempts ?? 0;
    if (attempts >= 5) {
      await Patient.updateOne(
        { _id: patient._id },
        { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
      );
      return NextResponse.json(
        { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' },
        { status: 429 }
      );
    }

    const otpMatch = await bcrypt.compare(otp, patient.otp);
    if (!otpMatch) {
      await Patient.updateOne({ _id: patient._id }, { $inc: { otpAttempts: 1 } });
      return invalidError;
    }

    await Patient.updateOne(
      { _id: patient._id },
      { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
    );

    const token = await issueToken(patient);
    logger.info('Patient Bearer token issued (OTP)', { patientId: patient._id.toString() });
    return tokenResponse(token, patient);
  } catch (error: any) {
    logger.error('Error in patient token (OTP)', error as Error);
    return NextResponse.json(
      { success: false, error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function issueToken(patient: any): Promise<string> {
  const secretKey = process.env.SESSION_SECRET;
  if (!secretKey) throw new Error('SESSION_SECRET is not configured');

  const encodedKey = new TextEncoder().encode(secretKey);

  return new SignJWT({
    patientId: patient._id.toString(),
    patientCode: patient.patientCode ?? '',
    type: 'patient',
    email: patient.email ?? `patient-${patient.patientCode}@clinic.local`,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(encodedKey);
}

function tokenResponse(token: string, patient: any): NextResponse {
  return NextResponse.json({
    success: true,
    message: 'Authentication successful',
    token,
    tokenType: 'Bearer',
    expiresIn: TOKEN_TTL_SECONDS,
    patient: {
      id: patient._id.toString(),
      patientCode: patient.patientCode ?? null,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email ?? null,
    },
  });
}
