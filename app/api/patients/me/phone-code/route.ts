import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { otpAvailable } from '@/lib/otp';
import { normalizePhone } from '@/lib/phone';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { maskPhone, phoneRateKey, sendPatientOtp } from '../../auth/shared';

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

    if (!otpAvailable()) {
      return NextResponse.json({ success: false, error: 'Text message codes are unavailable right now. Please try again later.' }, { status: 503 });
    }
    const sent = await sendPatientOtp(
      phone,
      session.patientId,
      (code, minutes) => `Your eMCR confirmation code is: ${code}. It expires in ${minutes} minutes. Do not share this code.`
    );
    if (!sent) {
      return NextResponse.json({ success: false, error: 'Couldn’t send a code. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { phone: maskPhone(phone) } });
  } catch (error) {
    logger.error('Error sending patient confirmation code', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t send a code. Please try again.' }, { status: 500 });
  }
}
