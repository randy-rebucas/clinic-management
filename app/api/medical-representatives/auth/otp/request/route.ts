import { NextRequest, NextResponse, after } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { maskPhone, normalizePhone } from '@/lib/phone';
import { otpAvailable, startOtp } from '@/lib/otp';
import { phoneRateKey } from '@/app/api/patients/auth/shared';
import { findRepsByVerifiedPhone, REP_LOGIN_CODE_MINUTES, repLoginCodeMessage } from '../../../_lib/rep-otp';

/**
 * POST /api/medical-representatives/auth/otp/request
 * Body: { phone } → { expiresInMinutes }
 *
 * Text a sign-in code to a rep's verified mobile number. Always the same answer, sent before the
 * text goes out, so it can't be used to learn which numbers have an account.
 * Finish with POST /api/medical-representatives/auth/otp/verify.
 */
export async function POST(request: NextRequest) {
  const ipLimited = await applyRateLimit(request, rateLimiters.otpRequest);
  if (ipLimited) return ipLimited;

  let body: { phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  if (!phone) return NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 });

  const limited =
    (await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone))) ||
    (await applyRateLimit(request, rateLimiters.publicCodeGlobal, 'all'));
  if (limited) return limited;

  // Before any lookup: refusing after one would reveal which numbers are on file.
  if (!otpAvailable()) {
    logger.error('Rep sign-in code requested but no SMS provider is configured', new Error('OTP unavailable'));
    return NextResponse.json(
      { success: false, error: 'Text message codes are unavailable right now. Sign in with your email and password.', code: 'CODES_UNAVAILABLE' },
      { status: 503 }
    );
  }

  // After the response, so a number with an account doesn't answer slower than one without.
  after(async () => {
    try {
      const reps = await findRepsByVerifiedPhone(phone);
      if (reps.length === 0) return;
      await startOtp({ scope: 'medrep-login', phone, message: repLoginCodeMessage });
      logger.info('Rep sign-in code sent', { phone: maskPhone(phone) });
    } catch (error) {
      logger.error('Error sending rep sign-in code', error as Error, { phone: maskPhone(phone) });
    }
  });

  return NextResponse.json({ success: true, expiresInMinutes: REP_LOGIN_CODE_MINUTES }, { headers: { 'Cache-Control': 'no-store' } });
}
