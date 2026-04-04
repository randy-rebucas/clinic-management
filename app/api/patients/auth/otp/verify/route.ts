import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { Types } from 'mongoose';

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
    await connectDB();

    let body: { phone?: string; otp?: string; tenantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined;

    if (!phone || !otp) {
      return NextResponse.json(
        { success: false, error: 'Phone number and OTP are required' },
        { status: 400 }
      );
    }

    const query: any = {
      $or: [{ phone }, { 'contacts.phone': phone }],
    };
    if (tenantId) {
      query.tenantIds = new Types.ObjectId(tenantId);
    }

    // Select OTP fields which have select: false in schema
    const patient = await Patient.findOne(query).select('+otp +otpExpiry +otpAttempts');

    const invalidError = NextResponse.json(
      { success: false, error: 'Invalid or expired OTP' },
      { status: 401 }
    );

    if (!patient || patient.active === false) return invalidError;
    if (!patient.otp || !patient.otpExpiry) return invalidError;

    // Check expiry
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

    // Check attempt count
    const attempts = patient.otpAttempts ?? 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await Patient.updateOne(
        { _id: patient._id },
        { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
      );
      return NextResponse.json(
        {
          success: false,
          error: 'Too many incorrect attempts. Please request a new OTP.',
        },
        { status: 429 }
      );
    }

    const otpMatch = await bcrypt.compare(otp, patient.otp);
    if (!otpMatch) {
      await Patient.updateOne(
        { _id: patient._id },
        { $inc: { otpAttempts: 1 } }
      );
      return invalidError;
    }

    // OTP is valid — clear OTP fields
    await Patient.updateOne(
      { _id: patient._id },
      { $unset: { otp: 1, otpExpiry: 1 }, $set: { otpAttempts: 0 } }
    );

    const secretKey = process.env.SESSION_SECRET;
    if (!secretKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }

    const encodedKey = new TextEncoder().encode(secretKey);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const patientJwt = await new SignJWT({
      patientId: patient._id.toString(),
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
        patientId: patient._id.toString(),
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

    logger.info('Patient OTP login successful', {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
    });

    return response;
  } catch (error: any) {
    logger.error('Error in patient OTP verification', error as Error);
    return NextResponse.json(
      { success: false, error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}
