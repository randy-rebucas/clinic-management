import { NextRequest, NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { sealTotpSecret, verifyUserTotp } from '../totp';

/**
 * POST /api/auth/2fa/setup
 * Body (required only when 2FA is already enabled): { token: "123456" } or { password: "..." }
 *
 * Generates a new TOTP secret for the authenticated user and returns:
 * - otpauthUrl  (for QR code scan in Google Authenticator / Authy)
 * - qrCodeDataUrl (base64 PNG, ready to embed as <img src="...">)
 * - manualEntryKey (the raw secret for manual entry)
 *
 * The new secret is stored as pending; the current 2FA state is unchanged until the
 * user confirms it via POST /api/auth/2fa/verify.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `2fa:${session.userId}`);
  if (limited) return limited;

  try {
    let body: { token?: unknown; password?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    await connectDB();

    const user = await User.findById(session.userId)
      .select('+password totpEnabled')
      .lean<{ password?: string; totpEnabled?: boolean } | null>();
    if (!user) return unauthorizedResponse();

    if (user.totpEnabled) {
      const codeOk = typeof body.token === 'string' && (await verifyUserTotp(session.userId, body.token));
      const passwordOk =
        !codeOk &&
        typeof body.password === 'string' &&
        !!user.password &&
        (await bcrypt.compare(body.password, user.password));
      if (!codeOk && !passwordOk) {
        return NextResponse.json(
          { success: false, error: 'A current authenticator code or your password is required to reset 2FA' },
          { status: 401 }
        );
      }
    }

    const secret = generateSecret();
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'MyClinicsoftware';
    const otpauthUrl = generateURI({ secret, label: session.email, issuer: appName });

    await User.updateOne(
      { _id: session.userId },
      { $set: { totpPendingSecret: sealTotpSecret(secret) } }
    );

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({
      success: true,
      data: {
        qrCodeDataUrl,
        otpauthUrl,
        manualEntryKey: secret,
      },
    });
  } catch (error: any) {
    console.error('Error setting up 2FA:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate 2FA secret' }, { status: 500 });
  }
}
