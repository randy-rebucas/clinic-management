import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { sendSMS } from '@/lib/sms';
import { normalizePhone } from '@/lib/phone';
import { invalidTenantResponse, maskPhone, parseOptionalTenantId, phoneFilter } from '../../shared';

const OTP_EXPIRY_MINUTES = 5;
const OTP_LENGTH = 6;

function generateOTP(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

/**
 * Request an OTP sent to the patient's registered phone number
 * POST /api/patients/auth/otp/request
 * Body: { phone, tenantId? }
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    let body: { phone?: unknown; tenantId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const tenant = parseOptionalTenantId(body.tenantId);
    if (!tenant.ok) return invalidTenantResponse();

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Per-destination cap (SMS bombing / cost abuse), independent of the caller's IP
    const perPhoneLimit = await applyRateLimit(request, rateLimiters.otpSend, `otp:${phone}`);
    if (perPhoneLimit) return perPhoneLimit;

    await connectDB();

    // Build tenant-scoped query — search both phone and contacts.phone
    const query: Record<string, unknown> = phoneFilter(phone);
    if (tenant.tenantId) {
      query.tenantIds = tenant.tenantId;
    }

    const patient = await Patient.findOne(query);

    // Always respond with success to avoid phone number enumeration
    const genericResponse = NextResponse.json({
      success: true,
      message: `If a matching account is found, an OTP will be sent to your phone within ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    if (!patient || patient.active === false) return genericResponse;

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Patient.updateOne(
      { _id: patient._id },
      {
        $set: { otp: otpHash, otpExpiry, otpAttempts: 0 },
      }
    );

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      logger.warn('Patient OTP requested for an unroutable phone number', {
        patientId: patient._id.toString(),
      });
      return genericResponse;
    }

    const smsResult = await sendSMS({
      to: normalizedPhone,
      message: `Your clinic login code is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
    });

    if (!smsResult.success && smsResult.error && !smsResult.error.includes('logged only')) {
      logger.error('Failed to send OTP SMS', new Error(smsResult.error), {
        patientId: patient._id.toString(),
      });
    }

    logger.info('Patient OTP requested', {
      patientId: patient._id.toString(),
      phone: maskPhone(normalizedPhone),
    });

    return genericResponse;
  } catch (error: any) {
    logger.error('Error in patient OTP request', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to send OTP. Please try again.' },
      { status: 500 }
    );
  }
}
