import { NextRequest, NextResponse } from 'next/server';
import { verify as totpVerify } from 'otplib';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

/**
 * POST /api/auth/2fa/verify
 * Body: { token: "123456" }
 *
 * Verifies the TOTP token against the stored secret.
 * If valid and 2FA not yet enabled → enables it (enrollment flow).
 * If valid and 2FA already enabled → confirms identity (login step-up).
 *
 * Returns: { success: true, enabled: boolean }
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
    }

    await connectDB();

    const user = await User.findById(session.userId).select('+totpSecret totpEnabled').lean() as any;
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (!user.totpSecret) {
      return NextResponse.json(
        { success: false, error: '2FA setup not initiated. Call POST /api/auth/2fa/setup first.' },
        { status: 400 }
      );
    }

    const result = await totpVerify({ token: token.trim(), secret: user.totpSecret });
    const isValid = result?.valid === true;
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    // Enable 2FA if this was the enrollment verification
    if (!user.totpEnabled) {
      await User.findByIdAndUpdate(session.userId, { totpEnabled: true });
    }

    return NextResponse.json({ success: true, enabled: true });
  } catch (error: any) {
    console.error('Error verifying 2FA token:', error);
    return NextResponse.json({ success: false, error: 'Failed to verify token' }, { status: 500 });
  }
}
