import { NextRequest, NextResponse } from 'next/server';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

/**
 * POST /api/auth/2fa/setup
 * Generates a new TOTP secret for the authenticated user and returns:
 * - otpauthUrl  (for QR code scan in Google Authenticator / Authy)
 * - qrCodeDataUrl (base64 PNG, ready to embed as <img src="...">)
 * - manualEntryKey (the raw secret for manual entry)
 *
 * The secret is stored but 2FA is NOT enabled until the user verifies it
 * via POST /api/auth/2fa/verify.
 */
export async function POST(_request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  try {
    await connectDB();

    const secret = generateSecret();
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'MyClinicsoftware';
    const otpauthUrl = generateURI({ secret, label: session.email, issuer: appName });

    // Save the secret (not yet enabled)
    await User.findByIdAndUpdate(session.userId, {
      totpSecret: secret,
      totpEnabled: false,
    });

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
