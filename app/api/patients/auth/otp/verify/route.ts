import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { runAsSystem } from '@/lib/tenant-context';
import {
  findPatientAcrossTenantsWithAuthFields,
  clearPatientOtp,
  incrementPatientOtpAttempts,
} from '@/lib/data/patient';

const MAX_OTP_ATTEMPTS = 5;

/**
 * Verify OTP and issue patient_session cookie
 * POST /api/patients/auth/otp/verify
 * Body: { phone, otp, tenantId? }
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    let body: { phone?: string; otp?: string; tenantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined;

    if (!phone || !otp) {
      return NextResponse.json({ success: false, error: 'Phone number and OTP are required' }, { status: 400 });
    }

    const patient = await runAsSystem(() => findPatientAcrossTenantsWithAuthFields({ phone, tenantId }));

    const invalidError = NextResponse.json({ success: false, error: 'Invalid or expired OTP' }, { status: 401 });

    if (!patient || patient.active === false) return invalidError;
    if (!patient.otp || !patient.otpExpiry) return invalidError;

    if (new Date() > patient.otpExpiry) {
      await runAsSystem(() => clearPatientOtp(patient.id));
      return NextResponse.json({ success: false, error: 'OTP has expired. Please request a new one.' }, { status: 401 });
    }

    const attempts = patient.otpAttempts ?? 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await runAsSystem(() => clearPatientOtp(patient.id));
      return NextResponse.json(
        { success: false, error: 'Too many incorrect attempts. Please request a new OTP.' },
        { status: 429 }
      );
    }

    const otpMatch = await bcrypt.compare(otp, patient.otp);
    if (!otpMatch) {
      await runAsSystem(() => incrementPatientOtpAttempts(patient.id));
      return invalidError;
    }

    await runAsSystem(() => clearPatientOtp(patient.id));

    const secretKey = process.env.SESSION_SECRET;
    if (!secretKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const encodedKey = new TextEncoder().encode(secretKey);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const patientJwt = await new SignJWT({
      patientId: patient.id,
      patientCode: patient.patientCode,
      type: 'patient',
      email: patient.email || `patient-${patient.patientCode}@clinic.local`,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(encodedKey);

    const response = NextResponse.json({
      success: true,
      data: {
        patientId: patient.id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
      },
      message: 'Login successful',
    });

    response.cookies.set('patient_session', patientJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires,
      path: '/',
    });

    logger.info('Patient OTP login successful', { patientId: patient.id, patientCode: patient.patientCode });

    return response;
  } catch (error: any) {
    logger.error('Error in patient OTP verification', error as Error);
    return NextResponse.json({ success: false, error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
