import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { verifyUserTotp } from '../totp';

/**
 * POST /api/auth/2fa/disable
 * Body: { token: "123456" }
 *
 * Disables 2FA for the authenticated user.
 * Requires a valid TOTP token to confirm identity before disabling.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `2fa:${session.userId}`);
  if (limited) return limited;

  try {
    let token: unknown;
    try {
      ({ token } = await request.json());
    } catch {
      token = undefined;
    }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'TOTP token required to disable 2FA' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findById(session.userId).select('+totpSecret totpEnabled').lean() as any;
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (!user.totpEnabled || !user.totpSecret) {
      return NextResponse.json({ success: false, error: '2FA is not currently enabled' }, { status: 400 });
    }

    if (!(await verifyUserTotp(session.userId, token))) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    await User.updateOne(
      { _id: session.userId },
      {
        $unset: { totpSecret: '', totpPendingSecret: '', totpLastUsedStep: '' },
        $set: { totpEnabled: false },
      }
    );

    return NextResponse.json({ success: true, message: '2FA has been disabled.' });
  } catch (error: any) {
    console.error('Error disabling 2FA:', error);
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
