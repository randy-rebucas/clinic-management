import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { hashLoginQrToken, patientLoginResponse } from '../auth/shared';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43,128}$/;

function readQrToken(qrCode: unknown): string | null {
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
  if (type !== 'patient_login' || typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
  return token;
}

/**
 * Patient QR Code Login
 * POST /api/patients/qr-login
 * Body: { qrCode: '{"type":"patient_login","token":"<server-issued token>"}' }
 *
 * The QR must carry a random token issued by GET /api/patients/me/login-qr (stored hashed,
 * expiring, revocable). Patient codes / ids alone are not credentials.
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

    const token = readQrToken(body.qrCode);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'This QR code is not valid for login. Please ask the clinic for a new one or sign in another way.' },
        { status: 400 }
      );
    }

    await connectDB();

    const patient = await Patient.findOne({
      loginQrTokenHash: hashLoginQrToken(token),
      loginQrTokenExpiry: { $gt: new Date() },
      active: { $ne: false },
    });

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
