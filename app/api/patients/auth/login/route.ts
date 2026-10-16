import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { dummyPasswordHash, invalidTenantResponse, parseOptionalTenantId, patientLoginResponse } from '../shared';

/**
 * Patient email + password login
 * POST /api/patients/auth/login
 * Body: { email, password, tenantId? }
 * Returns: patient_session cookie (7-day JWT)
 */
export async function POST(request: NextRequest) {
  try {
    let body: { email?: unknown; password?: unknown; tenantId?: unknown };
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
    const tenant = parseOptionalTenantId(body.tenantId);
    if (!tenant.ok) return invalidTenantResponse();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const rateLimitResponse = await applyAuthRateLimits(request, `patient-login:${email}`);
    if (rateLimitResponse) return rateLimitResponse;

    await connectDB();

    // Build tenant-scoped query
    const query: Record<string, unknown> = { email };
    if (tenant.tenantId) {
      query.tenantIds = tenant.tenantId;
    }

    // Explicitly select password (it has select: false in schema)
    const patient = await Patient.findOne(query).select('+password');

    // Use a generic error to avoid user enumeration
    const invalidCredentialsError = NextResponse.json(
      { success: false, error: 'Invalid email or password' },
      { status: 401 }
    );

    const passwordMatch = await bcrypt.compare(password, patient?.password || dummyPasswordHash());
    if (!patient || !patient.password || !passwordMatch) return invalidCredentialsError;

    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    logger.info('Patient email login successful', {
      patientId: patient._id.toString(),
    });

    return await patientLoginResponse(patient);
  } catch (error: any) {
    logger.error('Error in patient email login', error as Error);
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
