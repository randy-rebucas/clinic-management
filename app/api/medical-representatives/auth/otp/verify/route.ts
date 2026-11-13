import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import User from '@/models/User';
import { issuePending2faToken } from '@/app/lib/dal';
import { applyAuthRateLimits, rateLimiters } from '@/lib/middleware/rate-limit';
import { normalizePhone } from '@/lib/phone';
import { consumeOtp } from '@/lib/otp';
import { auditRepSignIn, repTokenResponse } from '../../../_lib/rep-login';
import { findRepsByVerifiedPhone } from '../../../_lib/rep-otp';
import { issueActivationToken } from '@/lib/medrep-app-signup';

const fail = (error: string, status: number, code?: string) =>
  NextResponse.json({ success: false, error, ...(code ? { code } : {}) }, { status });

/**
 * POST /api/medical-representatives/auth/otp/verify
 * Body: { phone, code }
 *
 * Sign in with the texted code. Same answer as POST /auth/token: the token pair and rep summary,
 * or `{ requires2fa, pendingToken }` (401) for accounts with an authenticator app, and the same
 * refusal codes (MEDREP_INACTIVE, USER_INACTIVE). MULTIPLE_ACCOUNTS: two reps share the number,
 * so the code can't say which one; sign in with email and password instead.
 */
export async function POST(request: NextRequest) {
  let body: { phone?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!phone) return fail('Enter a valid mobile number.', 400);
  if (!/^\d{6}$/.test(code)) return fail('Enter the 6-digit code we texted you.', 400);

  const limited = await applyAuthRateLimits(request, `medrep-otp:${phone}`, rateLimiters.otpRequest);
  if (limited) return limited;

  try {
    await connectDB();
    const result = await consumeOtp({ scope: 'medrep-login', phone }, code);
    if (!result.ok) {
      if (result.reason === 'locked') return fail('Too many wrong codes. Send a new one.', 429, 'CODE_LOCKED');
      // No challenge looks like a wrong code: /otp/request makes one only for a number with an
      // account, so "expired" here would tell anyone which numbers belong to a rep.
      if (result.reason === 'expired' && !result.noChallenge) return fail('That code has expired. Send a new one.', 400, 'CODE_EXPIRED');
      return fail('That code isn’t right. Check it and try again.', 400, 'CODE_INVALID');
    }

    // The code is spent: anything below refuses this sign-in for good, so a new code is needed.
    const reps = await findRepsByVerifiedPhone(phone);
    if (reps.length > 1) {
      return fail('More than one account uses this number. Sign in with your email and password.', 409, 'MULTIPLE_ACCOUNTS');
    }
    const medicalRep = reps[0];
    const user = medicalRep?.userId ? await User.findById(medicalRep.userId).populate('role') : null;
    if (!medicalRep || !user || (user.role as any)?.name !== 'medical-representative') {
      return fail('That code isn’t right. Check it and try again.', 400, 'CODE_INVALID');
    }
    const email = String(user.email);

    if (user.status !== 'active') {
      await auditRepSignIn(request, user, email, null, false, user.status === 'suspended' ? 'Account is suspended' : 'Account is closed');
      return fail('Your account is not active. Please contact support.', 403, 'USER_INACTIVE');
    }
    if (!medicalRep.isActivated || medicalRep.status !== 'active') {
      await auditRepSignIn(request, user, email, null, false, 'Representative profile not activated');
      // Not paid yet: the code proved who this is, so hand the app a pass to pay with (no password
      // to send after a code sign-in). A deactivated, already-paid account gets none.
      const unpaid = !medicalRep.isActivated && medicalRep.paymentStatus !== 'completed';
      const pass = unpaid ? await issueActivationToken(medicalRep._id) : null;
      return NextResponse.json(
        {
          success: false,
          error: 'Your account is not activated. Please complete payment or contact support.',
          code: 'MEDREP_INACTIVE',
          ...(pass ? { activationToken: pass.token, activationExpiresAt: pass.expiresAt } : {}),
        },
        { status: 403 }
      );
    }

    if (user.totpEnabled) {
      const pendingToken = await issuePending2faToken(user._id.toString(), undefined);
      return NextResponse.json(
        { success: false, requires2fa: true, pendingToken, error: 'Two-factor authentication required.' },
        { status: 401 }
      );
    }

    return await repTokenResponse(request, {
      user,
      medicalRep,
      roleId: (user.role as any)?._id?.toString(),
      tenantId: null,
      email,
    });
  } catch (error) {
    logger.error('Rep sign-in by code failed', error as Error);
    return fail('Failed to sign in', 500);
  }
}
