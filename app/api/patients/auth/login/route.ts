import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { Types } from 'mongoose';

/**
 * Patient email + password login
 * POST /api/patients/auth/login
 * Body: { email, password, tenantId? }
 * Returns: patient_session cookie (7-day JWT)
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();

    let body: { email?: string; password?: string; tenantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Build tenant-scoped query
    const query: any = { email };
    if (tenantId) {
      query.tenantIds = new Types.ObjectId(tenantId);
    }

    // Explicitly select password (it has select: false in schema)
    const patient = await Patient.findOne(query).select('+password');

    // Use a generic error to avoid user enumeration
    const invalidCredentialsError = NextResponse.json(
      { success: false, error: 'Invalid email or password' },
      { status: 401 }
    );

    if (!patient) return invalidCredentialsError;

    if (!patient.password) {
      // Account exists but was not created with a password — redirect to QR or OTP
      return NextResponse.json(
        {
          success: false,
          error: 'This account does not have a password set. Please use QR code or OTP login.',
          code: 'NO_PASSWORD',
        },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, patient.password);
    if (!passwordMatch) return invalidCredentialsError;

    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

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
      email: patient.email || email,
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

    logger.info('Patient email login successful', {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
    });

    return response;
  } catch (error: any) {
    logger.error('Error in patient email login', error as Error);
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
