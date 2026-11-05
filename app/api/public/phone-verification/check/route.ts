import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import { applyAuthRateLimits, rateLimiters } from '@/lib/middleware/rate-limit';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { normalizePhone } from '@/lib/phone';
import { consumeOtp } from '@/lib/otp';
import { resolvePublicTenant } from '@/lib/public-tenant';
import { createPhoneProof, PUBLIC_CODE_PURPOSES } from '@/lib/public-phone-proof';
import { otpFailureResponse, phoneRateKey } from '@/app/api/patients/auth/shared';

const schema = z.object({
  phone: z.string().trim().min(1).max(30),
  code: z.string().trim().min(1).max(10),
  purpose: z.enum(PUBLIC_CODE_PURPOSES),
  tenantId: z.string().optional(),
});

/**
 * POST /api/public/phone-verification/check
 * Check a code from /start. Body: { phone, code, purpose, tenantId? } → { proof, expiresAt }
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { code, purpose } = parsed.data;

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 });

    const limited = await applyAuthRateLimits(request, `public-code:${phoneRateKey(phone)}`, rateLimiters.otpRequest);
    if (limited) return limited;

    const tenantId = await resolvePublicTenant(parsed.data.tenantId);
    if (!tenantId) return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });

    const result = await consumeOtp({ scope: 'public', phone, purpose, tenantId }, code);
    if (!result.ok) return otpFailureResponse(result.reason);

    const { token, expiresAt } = createPhoneProof(phone, tenantId, purpose);
    return NextResponse.json({ success: true, proof: token, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error checking public phone code', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
