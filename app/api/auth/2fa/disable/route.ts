import { NextRequest, NextResponse } from 'next/server';
import { verify as totpVerify } from 'otplib';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getUserTotpSecret, updateUser } from '@/lib/data/user';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

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

  try {
    const { token } = await request.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'TOTP token required to disable 2FA' }, { status: 400 });
    }

    // Explicit tenant branch: a real session.tenantId -> runWithTenant
    // (auto-scoped read/update); no tenantId (legacy no-subdomain mode) ->
    // runAsSystem, since there is no tenant to scope by.
    const tenantId = session.tenantId;
    const user = tenantId
      ? await runWithTenant(tenantId, () => getUserTotpSecret(session.userId))
      : await runAsSystem(() => getUserTotpSecret(session.userId));

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (!user.totpEnabled || !user.totpSecret) {
      return NextResponse.json({ success: false, error: '2FA is not currently enabled' }, { status: 400 });
    }

    const result = await totpVerify({ token: token.trim(), secret: user.totpSecret });
    const isValid = result?.valid === true;
    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    const disable = () => updateUser(session.userId, { totpSecret: null, totpEnabled: false });
    if (tenantId) {
      await runWithTenant(tenantId, disable);
    } else {
      await runAsSystem(disable);
    }

    return NextResponse.json({ success: true, message: '2FA has been disabled.' });
  } catch (error: any) {
    console.error('Error disabling 2FA:', error);
    return NextResponse.json({ success: false, error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
