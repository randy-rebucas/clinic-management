import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { normalizePhone } from '@/lib/phone';
import { redisRestEnv } from '@/lib/redis';
import { turnstileRejection } from '@/lib/turnstile';
import { OTP_EXPIRY_MINUTES, otpAvailable, startOtp } from '@/lib/otp';
import { resolvePublicTenant } from '@/lib/public-tenant';
import { PUBLIC_CODE_PURPOSES } from '@/lib/public-phone-proof';
import { phoneRateKey } from '@/app/api/patients/auth/shared';

const schema = z.object({
  phone: z.string().trim().min(1).max(30),
  purpose: z.enum(PUBLIC_CODE_PURPOSES),
  tenantId: z.string().optional(),
  turnstileToken: z.string().max(2048).optional(),
});

const UNAVAILABLE = 'Text message codes are unavailable right now. Please contact the clinic.';

/**
 * Anyone can call this and it sends a paid text to a number they type, so in production it needs
 * the captcha and shared rate limits: without them the limits are per instance and the captcha
 * passes everything.
 */
function abuseProtectionReady(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return !!process.env.TURNSTILE_SECRET_KEY && !!redisRestEnv().url;
}

/**
 * POST /api/public/phone-verification/start
 * Text a code for a public form. Body: { phone, purpose, tenantId?, turnstileToken }
 */
export async function POST(request: NextRequest) {
  const ipLimited = await applyRateLimit(request, rateLimiters.publicCodeIp);
  if (ipLimited) return ipLimited;

  if (!otpAvailable() || !abuseProtectionReady()) {
    logger.error('Public phone code requested without its protections', new Error('Public codes unavailable'));
    return NextResponse.json({ success: false, error: UNAVAILABLE }, { status: 503 });
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { purpose, turnstileToken } = parsed.data;

    const captchaRejected = await turnstileRejection(request, turnstileToken);
    if (captchaRejected) return captchaRejected;

    const tenantId = await resolvePublicTenant(parsed.data.tenantId);
    if (!tenantId) return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 });

    const limited =
      (await applyRateLimit(request, rateLimiters.otpSend, phoneRateKey(phone))) ||
      (await applyRateLimit(request, rateLimiters.publicCodeClinic, String(tenantId))) ||
      (await applyRateLimit(request, rateLimiters.publicCodeGlobal, 'all'));
    if (limited) return limited;

    const sent = await startOtp({
      scope: 'public',
      phone,
      purpose,
      tenantId,
      message: (code, minutes) => `Your verification code is ${code}. It expires in ${minutes} minutes. Never share this code.`,
    });
    if (!sent) {
      return NextResponse.json({ success: false, error: 'We couldn’t text that number. Please check it and try again.' }, { status: 502 });
    }
    return NextResponse.json({ success: true, expiresInMinutes: OTP_EXPIRY_MINUTES });
  } catch (error) {
    logger.error('Error starting public phone verification', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t send a code. Please try again.' }, { status: 500 });
  }
}
