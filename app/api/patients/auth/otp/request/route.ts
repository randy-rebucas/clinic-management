import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

const OTP_EXPIRY_MINUTES = 5;
const OTP_LENGTH = 6;

function generateOTP(): string {
  return Math.floor(Math.random() * 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return phone.replace(/\s/g, '');
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
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
    await connectDB();

    let body: { phone?: string; tenantId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : undefined;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Build tenant-scoped query — search both phone and contacts.phone
    const query: any = {
      $or: [{ phone }, { 'contacts.phone': phone }],
    };
    if (tenantId) {
      query.tenantIds = new Types.ObjectId(tenantId);
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
      phone: normalizedPhone,
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
