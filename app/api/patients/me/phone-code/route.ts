import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { sendSMS } from '@/lib/sms';
import { normalizePhone } from '@/lib/phone';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { maskPhone, phoneRateKey } from '../../auth/shared';

const OTP_EXPIRY_MINUTES = 5;

/**
 * POST /api/patients/me/phone-code
 * Text a confirmation code to the signed-in patient's own phone, stored on their own record, for
 * the `otp` field of actions that need phone proof (set a password, add a family member).
 *
 * Unlike POST /api/patients/auth/otp/request (which finds a record by phone number), this can't
 * land on another record that shares the number, such as a child registered with a parent's phone.
 * → { phone: masked number } · 400 NO_PHONE when the record has no usable mobile number.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  const limited = await applyRateLimit(request, rateLimiters.auth, `patient-phone-code:${session.patientId}`);
  if (limited) return limited;

  try {
    await connectDB();
    const patient = await Patient.findById(session.patientId).select('phone active').lean<{ phone?: string; active?: boolean } | null>();
    if (!patient || patient.active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }
    const phone = patient.phone ? normalizePhone(patient.phone) : null;
    if (!phone) {
      return NextResponse.json(
        { success: false, code: 'NO_PHONE', error: 'There’s no mobile number on your record. Ask the front desk to add one.' },
        { status: 400 }
      );
    }

    const perPhoneLimit = await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone));
    if (perPhoneLimit) return perPhoneLimit;

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await Patient.updateOne(
      { _id: session.patientId },
      { $set: { otp: await bcrypt.hash(otp, 10), otpExpiry: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000), otpAttempts: 0 } }
    );

    const sms = await sendSMS({
      to: phone,
      message: `Your eMCR confirmation code is: ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
    });
    if (sms.skipped && process.env.NODE_ENV !== 'production') {
      console.warn(`[dev] Patient confirmation code for ${maskPhone(phone)}: ${otp}`);
    }
    if (!sms.success && sms.error && !sms.error.includes('logged only')) {
      logger.error('Failed to send patient confirmation code', new Error(sms.error), { patientId: session.patientId });
    }

    return NextResponse.json({ success: true, data: { phone: maskPhone(phone) } });
  } catch (error) {
    logger.error('Error sending patient confirmation code', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t send a code. Please try again.' }, { status: 500 });
  }
}
