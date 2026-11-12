import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import RepAppSignup from '@/models/RepAppSignup';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isValidationError, parseBody } from '@/lib/api/validate';
import { maskPhone } from '@/lib/phone';
import { consumeOtp, OTP_EXPIRY_MINUTES } from '@/lib/otp';
import { phoneRateKey } from '@/app/api/patients/auth/shared';
import {
  MAX_EMAIL_CODE_ATTEMPTS,
  appSignupUnavailable,
  findAppSignup,
  isValidEmailCodeFormat,
  sendSignupPhoneCode,
  signupExpiredResponse,
} from '@/lib/medrep-app-signup';

const schema = z.object({
  signupId: z.string().max(64),
  channel: z.enum(['email', 'phone']),
  code: z.string().trim().max(10),
});

const wrongCode = () =>
  NextResponse.json({ success: false, error: 'That code isn’t right. Check it and try again.', code: 'CODE_INVALID' }, { status: 400 });
const codeExpired = () =>
  NextResponse.json({ success: false, error: 'That code has expired. Send a new one.', code: 'CODE_EXPIRED' }, { status: 400 });
const codeLocked = () =>
  NextResponse.json({ success: false, error: 'Too many wrong codes. Send a new one.', code: 'CODE_LOCKED' }, { status: 429 });

/** Text the phone code once the email is proven. Returns whether it went out. */
async function textPhoneCode(request: NextRequest, phone: string): Promise<boolean> {
  const limited =
    (await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone))) ||
    (await applyRateLimit(request, rateLimiters.publicCodeGlobal, 'all'));
  if (limited) return false;
  return sendSignupPhoneCode(phone);
}

/**
 * POST /api/medical-representatives/onboard/app/verify
 * Body: { signupId, channel: 'email' | 'phone', code }
 *
 * email: checks the emailed code, then texts the phone code → { next: 'phone', phone, phoneCodeSent }
 * phone: checks the texted code (email must be verified first) → { next: 'password' }
 */
export async function POST(request: NextRequest) {
  const unavailable = appSignupUnavailable();
  if (unavailable) return unavailable;

  const ipLimited = await applyRateLimit(request, rateLimiters.otpRequest);
  if (ipLimited) return ipLimited;

  try {
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { signupId, channel, code } = parsed.data;

    await connectDB();
    const signup = await findAppSignup(signupId);
    if (!signup) return signupExpiredResponse();

    if (channel === 'email') {
      if (signup.emailVerifiedAt) {
        return NextResponse.json({ success: true, next: 'phone', phone: maskPhone(signup.phoneE164), phoneCodeSent: false });
      }
      if (!isValidEmailCodeFormat(code)) return wrongCode();

      // Raise the counter before comparing, in one update, so parallel guesses stay capped.
      const counted = await RepAppSignup.findOneAndUpdate(
        { _id: signup._id, emailCodeAttempts: { $lt: MAX_EMAIL_CODE_ATTEMPTS }, emailCodeExpiresAt: { $gt: new Date() } },
        { $inc: { emailCodeAttempts: 1 } },
        { new: true }
      ).select('+emailCodeHash');
      if (!counted) {
        return signup.emailCodeAttempts >= MAX_EMAIL_CODE_ATTEMPTS ? codeLocked() : codeExpired();
      }
      if (!(await bcrypt.compare(code, counted.emailCodeHash))) return wrongCode();

      // Spend the code: only the request that flips this field goes on to text the phone.
      const marked = await RepAppSignup.updateOne(
        { _id: signup._id, emailVerifiedAt: { $exists: false } },
        { $set: { emailVerifiedAt: new Date(), emailCodeExpiresAt: new Date(0) } }
      );
      const phoneCodeSent = marked.modifiedCount > 0 ? await textPhoneCode(request, signup.phoneE164) : false;
      return NextResponse.json({
        success: true,
        next: 'phone',
        phone: maskPhone(signup.phoneE164),
        phoneCodeSent,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    }

    // Phone
    if (!signup.emailVerifiedAt) {
      return NextResponse.json({ success: false, error: 'Confirm your email first.', code: 'EMAIL_NOT_VERIFIED' }, { status: 409 });
    }
    if (signup.phoneVerifiedAt) return NextResponse.json({ success: true, next: 'password' });

    const result = await consumeOtp({ scope: 'medrep-signup', phone: signup.phoneE164 }, code);
    if (!result.ok) {
      if (result.reason === 'locked') return codeLocked();
      if (result.reason === 'expired' || result.noChallenge) return codeExpired();
      return wrongCode();
    }
    await RepAppSignup.updateOne({ _id: signup._id }, { $set: { phoneVerifiedAt: new Date() } });
    return NextResponse.json({ success: true, next: 'password' });
  } catch (error) {
    logger.error('Error verifying rep app signup code', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
