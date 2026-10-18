import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { findPatientByLoginQr, patientLoginResponse, readLoginQrToken } from '../auth/shared';

/**
 * Patient QR Code Login
 * POST /api/patients/qr-login
 * Body: { qrCode: '{"type":"patient_login","token":"<server-issued token>"}' }
 *
 * The QR must carry a random token issued by GET /api/patients/me/login-qr (stored hashed,
 * expiring, revocable). Patient codes / ids alone are not credentials.
 * Sets the patient_session cookie; the mobile app uses POST /api/patients/auth/token with
 * method "qr" to get a Bearer token instead.
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
    }

    if (!body?.qrCode) {
      return NextResponse.json(
        { success: false, error: 'QR code is required' },
        { status: 400 }
      );
    }

    const token = readLoginQrToken(body.qrCode);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'This QR code is not valid for login. Please ask the clinic for a new one or sign in another way.' },
        { status: 400 }
      );
    }

    const patient = await findPatientByLoginQr(token);

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'This QR code is invalid or has expired.' },
        { status: 401 }
      );
    }

    logger.info('Patient QR code login successful', {
      patientId: patient._id.toString(),
    });

    return await patientLoginResponse(patient);
  } catch (error: any) {
    logger.error('Error in patient QR code login', error as Error, {
      name: error?.name,
      code: error?.code,
    });

    return NextResponse.json(
      { success: false, error: 'Failed to login with QR code' },
      { status: 500 }
    );
  }
}
