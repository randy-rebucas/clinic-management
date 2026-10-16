import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { confirmPendingTotp, verifyUserTotp } from '../totp';

/**
 * POST /api/auth/2fa/verify
 * Body: { token: "123456" }
 *
 * If an enrollment is pending (POST /api/auth/2fa/setup) → confirms it and enables 2FA.
 * Otherwise, if 2FA is enabled → confirms identity (step-up). Each code can be used once.
 *
 * Returns: { success: true, enabled: boolean }
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const limited =
    (await applyRateLimit(request, rateLimiters.authAccount, `2fa:${session.userId}`)) ||
    (await applyRateLimit(request, rateLimiters.authAccountGlobal, `2fa:${session.userId}`));
  if (limited) return limited;

  try {
    let token: unknown;
    try {
      ({ token } = await request.json());
    } catch {
      token = undefined;
    }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findById(session.userId)
      .select('+totpSecret +totpPendingSecret totpEnabled')
      .lean<{ totpSecret?: string; totpPendingSecret?: string; totpEnabled?: boolean } | null>();
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    let isValid = false;
    if (user.totpPendingSecret) {
      isValid = await confirmPendingTotp(session.userId, token);
    } else if (user.totpEnabled && user.totpSecret) {
      isValid = await verifyUserTotp(session.userId, token);
    } else {
      return NextResponse.json(
        { success: false, error: '2FA setup not initiated. Call POST /api/auth/2fa/setup first.' },
        { status: 400 }
      );
    }

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    return NextResponse.json({ success: true, enabled: true });
  } catch (error: any) {
    console.error('Error verifying 2FA token:', error);
    return NextResponse.json({ success: false, error: 'Failed to verify token' }, { status: 500 });
  }
}
