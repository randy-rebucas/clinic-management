import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { sendSMS } from '@/lib/sms';
import { normalizePhone } from '@/lib/phone';
import { isMinor } from '@/lib/patient-family';
import {
  invalidTenantResponse,
  maskPhone,
  parseOptionalTenantId,
  phoneFilter,
  phoneRateKey,
  phoneVariants,
} from '../../shared';

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

    // Per-destination cap (SMS bombing / cost abuse), independent of the caller's IP. Keyed on
    // the normalized number so "0917…" and "+63917…" share one bucket.
    const perPhoneLimit = await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone));
    if (perPhoneLimit) return perPhoneLimit;

    await connectDB();

    // Build tenant-scoped query — search both phone and contacts.phone, in every stored spelling
    const query: Record<string, unknown> = phoneFilter(phone);
    if (tenant.tenantId) {
      query.tenantIds = tenant.tenantId;
    }

    // Prefer an active record whose own phone this is (sign-in then links the person's records at
    // other clinics); fall back to a minor's record listing it as a contact number (a parent
    // signing in for a child with no phone). An adult's contact number never signs in as them.
    const ownPhone: Record<string, unknown> = { phone: { $in: phoneVariants(phone) }, active: { $ne: false } };
    if (tenant.tenantId) ownPhone.tenantIds = tenant.tenantId;
    let patient = await Patient.findOne(ownPhone).sort({ updatedAt: -1 });
    if (!patient) {
      const contact = await Patient.findOne(query);
      if (contact && isMinor(contact.dateOfBirth)) patient = contact;
    }

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

    // Local development without Twilio: show the code in the dev server console so phone sign-in
    // can be tested. Never in production.
    if (smsResult.skipped && process.env.NODE_ENV !== 'production') {
      console.warn(`[dev] Patient OTP for ${maskPhone(normalizedPhone)}: ${otp}`);
    }

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
