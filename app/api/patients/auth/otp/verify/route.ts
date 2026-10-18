import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import {
  consumePatientOtp,
  invalidTenantResponse,
  otpFailureResponse,
  parseOptionalTenantId,
  patientLoginResponse,
  phoneFilter,
  phoneRateKey,
} from '../../shared';
import { linkRecordsByVerifiedPhone } from '../../../me/_lib/linked-records';

/**
 * Verify OTP and issue patient_session cookie
 * POST /api/patients/auth/otp/verify
 * Body: { phone, otp, tenantId? }
 */
export async function POST(request: NextRequest) {
  try {
    let body: { phone?: unknown; otp?: unknown; tenantId?: unknown };
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
    const tenant = parseOptionalTenantId(body.tenantId);
    if (!tenant.ok) return invalidTenantResponse();

    if (!phone || !otp) {
      return NextResponse.json(
        { success: false, error: 'Phone number and OTP are required' },
        { status: 400 }
      );
    }

    const rateLimitResponse = await applyAuthRateLimits(request, phoneRateKey(phone));
    if (rateLimitResponse) return rateLimitResponse;

    const filter: Record<string, unknown> = phoneFilter(phone);
    if (tenant.tenantId) {
      filter.tenantIds = tenant.tenantId;
    }

    const result = await consumePatientOtp(filter, otp);
    if (!result.ok) return otpFailureResponse(result.reason);

    // The phone is now proven: join this person's records at other clinics to this login.
    await linkRecordsByVerifiedPhone(result.patient._id.toString(), phone).catch((error) =>
      logger.error('Linking patient records by phone failed', error as Error, { patientId: result.patient._id.toString() })
    );

    logger.info('Patient OTP login successful', {
      patientId: result.patient._id.toString(),
    });

    return await patientLoginResponse(result.patient, { amr: 'otp' });
  } catch (error: any) {
    logger.error('Error in patient OTP verification', error as Error);
    return NextResponse.json(
      { success: false, error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}
