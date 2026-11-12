import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import RepAppSignup from '@/models/RepAppSignup';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isValidationError, parseBody } from '@/lib/api/validate';
import { OTP_EXPIRY_MINUTES } from '@/lib/otp';
import { phoneRateKey } from '@/app/api/patients/auth/shared';
import {
  EMAIL_CODE_TTL_MINUTES,
  appSignupUnavailable,
  findAppSignup,
  newEmailCode,
  sendSignupEmailCode,
  sendSignupPhoneCode,
  signupExpiredResponse,
} from '@/lib/medrep-app-signup';

const schema = z.object({
  signupId: z.string().max(64),
  channel: z.enum(['email', 'phone']),
});

/**
 * POST /api/medical-representatives/onboard/app/resend
 * Body: { signupId, channel } → { expiresInMinutes }
 * A new code replaces the old one. The phone code only once the email is verified.
 */
export async function POST(request: NextRequest) {
  const unavailable = appSignupUnavailable();
  if (unavailable) return unavailable;

  const ipLimited = await applyRateLimit(request, rateLimiters.otpRequest);
  if (ipLimited) return ipLimited;

  try {
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { signupId, channel } = parsed.data;

    await connectDB();
    const signup = await findAppSignup(signupId);
    if (!signup) return signupExpiredResponse();

    if (channel === 'email') {
      if (signup.emailVerifiedAt) return NextResponse.json({ success: true, alreadyVerified: true });
      const limited = await applyRateLimit(request, rateLimiters.repSignupEmail, signup.email);
      if (limited) return limited;

      const code = await newEmailCode();
      await RepAppSignup.updateOne(
        { _id: signup._id },
        { $set: { emailCodeHash: code.hash, emailCodeExpiresAt: code.expiresAt, emailCodeAttempts: 0 } }
      );
      if (!(await sendSignupEmailCode(signup.email, signup.fields.firstName, code.code))) {
        return NextResponse.json({ success: false, error: 'We couldn’t email a new code. Please try again.' }, { status: 502 });
      }
      return NextResponse.json({ success: true, expiresInMinutes: EMAIL_CODE_TTL_MINUTES });
    }

    if (!signup.emailVerifiedAt) {
      return NextResponse.json({ success: false, error: 'Confirm your email first.', code: 'EMAIL_NOT_VERIFIED' }, { status: 409 });
    }
    if (signup.phoneVerifiedAt) return NextResponse.json({ success: true, alreadyVerified: true });

    const limited =
      (await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(signup.phoneE164))) ||
      (await applyRateLimit(request, rateLimiters.publicCodeGlobal, 'all'));
    if (limited) return limited;

    if (!(await sendSignupPhoneCode(signup.phoneE164))) {
      return NextResponse.json(
        { success: false, error: 'We couldn’t text that number. Please check it and start again.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, expiresInMinutes: OTP_EXPIRY_MINUTES });
  } catch (error) {
    logger.error('Error resending rep app signup code', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
