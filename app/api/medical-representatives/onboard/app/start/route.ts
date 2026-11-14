import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepAppSignup from '@/models/RepAppSignup';
import User from '@/models/User';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isValidationError, parseBody, zEmail, zPersonName, zPhone, zShortText } from '@/lib/api/validate';
import { normalizePhone } from '@/lib/phone';
import { turnstileRejection } from '@/lib/turnstile';
import {
  APP_SIGNUP_TTL_MS,
  EMAIL_CODE_TTL_MINUTES,
  appSignupUnavailable,
  newEmailCode,
  newSignupId,
  sendAlreadyRegisteredEmail,
  sendSignupEmailCode,
} from '@/lib/medrep-app-signup';

const schema = z.object({
  firstName: zPersonName,
  lastName: zPersonName,
  email: zEmail,
  phone: zPhone,
  company: zShortText.min(1),
  territory: zShortText.optional(),
  title: z.string().trim().max(20).optional(),
  /** From the app's Turnstile WebView (/turnstile/app). */
  turnstileToken: z.string().max(2048).optional(),
});

/**
 * App builds before the Turnstile WebView send no token. Until REP_APP_TURNSTILE_REQUIRED=true
 * (set it once every install on the stores sends one), a missing token is let through; a token
 * that is sent is always checked.
 */
function captchaRequired(token: string | undefined): boolean {
  return token !== undefined || process.env.REP_APP_TURNSTILE_REQUIRED === 'true';
}

/**
 * POST /api/medical-representatives/onboard/app/start
 * Body: { firstName, lastName, email, phone, company, territory?, title?, turnstileToken? }
 * → { signupId, expiresInMinutes }
 *
 * Step one of signing up in the rep app: email a 6-digit code. The phone code follows only after
 * the email code is right (see ./verify), so this can't be used to text strangers.
 * An address that already has an account gets an email saying so and the same answer, so this
 * can't be used to learn who has an account.
 */
export async function POST(request: NextRequest) {
  const unavailable = appSignupUnavailable();
  if (unavailable) return unavailable;

  const ipLimited = await applyRateLimit(request, rateLimiters.auth);
  if (ipLimited) return ipLimited;

  try {
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const phone = normalizePhone(body.phone);
    if (!phone) return NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 });

    // After the field checks, so a typo doesn't use up the single-use token.
    if (captchaRequired(body.turnstileToken)) {
      const captchaRejected = await turnstileRejection(request, body.turnstileToken);
      if (captchaRejected) return captchaRejected;
    }

    const email = body.email;
    const emailLimited = await applyRateLimit(request, rateLimiters.repSignupEmail, email);
    if (emailLimited) return emailLimited;

    await connectDB();
    const signup = newSignupId();
    const answer = NextResponse.json(
      { success: true, signupId: signup.id, expiresInMinutes: EMAIL_CODE_TTL_MINUTES },
      { headers: { 'Cache-Control': 'no-store' } }
    );

    const taken = !!((await MedicalRepresentative.exists({ email })) || (await User.exists({ email })));
    // Taken: a decoy signup whose code never matches (verify answers wrong, then locked, as for a
    // new address); the owner gets an email explaining instead of a code.
    const code = taken
      ? {
          code: '',
          hash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
          expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60 * 1000),
        }
      : await newEmailCode();
    await RepAppSignup.updateOne(
      { email },
      {
        $set: {
          tokenHash: signup.hash,
          fields: {
            firstName: body.firstName,
            lastName: body.lastName,
            company: body.company,
            territory: body.territory || undefined,
            title: body.title || undefined,
          },
          phoneE164: phone,
          emailCodeHash: code.hash,
          emailCodeExpiresAt: code.expiresAt,
          emailCodeAttempts: 0,
          expiresAt: new Date(Date.now() + APP_SIGNUP_TTL_MS),
          ...(taken ? { decoy: true } : {}),
        },
        $unset: { emailVerifiedAt: 1, phoneVerifiedAt: 1, ...(taken ? {} : { decoy: 1 as const }) },
      },
      { upsert: true }
    );

    if (taken) {
      await sendAlreadyRegisteredEmail(email);
      return answer;
    }
    if (!(await sendSignupEmailCode(email, body.firstName, code.code))) {
      return NextResponse.json(
        { success: false, error: 'We couldn’t email a code to that address. Please check it and try again.' },
        { status: 502 }
      );
    }
    return answer;
  } catch (error) {
    logger.error('Error starting rep app signup', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
