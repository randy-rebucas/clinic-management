import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import {
  authenticatePatientPassword,
  invalidTenantResponse,
  parseOptionalTenantId,
  patientLoginResponse,
} from '../shared';

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

    const result = await authenticatePatientPassword(email, password, tenant.tenantId);

    // Use a generic error to avoid user enumeration
    if (!result.ok && result.reason === 'invalid') {
      return NextResponse.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!result.ok) {
      await recordPatientRefused(result.patient as any, request, 'sign-in');
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.', code: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    logger.info('Patient email login successful', {
      patientId: result.patient._id.toString(),
    });

    return await patientLoginResponse(result.patient, { tid: result.tid, amr: 'password' });
  } catch (error: any) {
    logger.error('Error in patient email login', error as Error);
    return NextResponse.json(
      { success: false, error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
