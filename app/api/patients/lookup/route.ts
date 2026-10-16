import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

/**
 * GET /api/patients/lookup
 *
 * Public endpoint for third-party applications to decide which login UI to render.
 *
 * It deliberately returns the SAME response whether or not a patient matches, so it
 * cannot be used to discover who is a patient of a clinic. Apps should offer both
 * login methods; the login endpoints themselves answer with generic errors.
 *
 * ── Query parameters ────────────────────────────────────────────────────────
 *   tenantId     (required)  ObjectId of the tenant (clinic).
 *   phone | email | patientCode  (at least one; accepted for compatibility)
 *
 * ── Response ────────────────────────────────────────────────────────────────
 *   {
 *     "success": true,
 *     "authMethods": { "password": true, "otp": true },
 *     "message": "..."
 *   }
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.public);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;
  const tenantId = searchParams.get('tenantId')?.trim() ?? '';
  const phone = searchParams.get('phone')?.trim() ?? '';
  const email = searchParams.get('email')?.trim() ?? '';
  const patientCode = searchParams.get('patientCode')?.trim() ?? '';

  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'tenantId is required' },
      { status: 400 }
    );
  }

  if (!/^[a-f\d]{24}$/i.test(tenantId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid tenantId format' },
      { status: 400 }
    );
  }

  if (!phone && !email && !patientCode) {
    return NextResponse.json(
      {
        success: false,
        error: 'At least one identifier is required: phone, email, or patientCode',
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    authMethods: {
      password: true,
      otp: true,
    },
    message:
      'Sign in with your email and password, or request a one-time code sent to your registered phone number.',
  });
}
