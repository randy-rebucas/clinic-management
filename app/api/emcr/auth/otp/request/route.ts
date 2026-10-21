import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { sendSMS } from '@/lib/sms';
import { normalizePhone } from '@/lib/phone';
import { maskPhone, phoneFilter, phoneRateKey } from '@/app/api/patients/auth/shared';
import { EMCR_OTP_EXPIRY_MINUTES, generateOtp, hashOtp } from '@/lib/emcr/session';

/**
 * POST /api/emcr/auth/otp/request
 * Body: { phone }
 *
 * Text a sign-in code to a phone number some clinic has on file (as a patient's own number or a
 * contact number). The code is held on the eMCR account for that number, not on a patient
 * record, so in a household sharing one number it can't land on a child's record. Always the
 * same answer, so it can't be used to learn which numbers are on file.
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.auth);
  if (limited) return limited;

  let body: { phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const typed = typeof body.phone === 'string' ? body.phone.trim() : '';
  const phone = normalizePhone(typed);
  if (!phone) return NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 });

  const perPhone = await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone));
  if (perPhone) return perPhone;

  const generic = NextResponse.json({
    success: true,
    message: `If a clinic has this number on file, a code will arrive by SMS within a minute. It expires in ${EMCR_OTP_EXPIRY_MINUTES} minutes.`,
  });

  try {
    await connectDB();
    const onFile = await Patient.exists({ ...phoneFilter(phone), active: { $ne: false } });
    if (!onFile) return generic;

    const otp = generateOtp();
    await EmcrAccount.findOneAndUpdate(
      { phone },
      {
        $set: { otp: await hashOtp(otp), otpExpiry: new Date(Date.now() + EMCR_OTP_EXPIRY_MINUTES * 60 * 1000), otpAttempts: 0 },
        $setOnInsert: { phone },
      },
      { upsert: true }
    );

    const sms = await sendSMS({
      to: phone,
      message: `Your eMCR sign-in code is ${otp}. It expires in ${EMCR_OTP_EXPIRY_MINUTES} minutes. Never share this code.`,
    });
    if (sms.skipped && process.env.NODE_ENV !== 'production') {
      console.warn(`[dev] eMCR OTP for ${maskPhone(phone)}: ${otp}`);
    }
    if (!sms.success && sms.error && !sms.error.includes('logged only')) {
      logger.error('Failed to send eMCR OTP SMS', new Error(sms.error), { phone: maskPhone(phone) });
    }
    logger.info('eMCR OTP requested', { phone: maskPhone(phone) });
    return generic;
  } catch (error) {
    logger.error('Error in eMCR OTP request', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to send the code. Please try again.' }, { status: 500 });
  }
}
