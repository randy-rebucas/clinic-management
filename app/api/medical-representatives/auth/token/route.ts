import { NextRequest, NextResponse } from 'next/server';
import { issuePending2faToken } from '@/app/lib/dal';
import { repTokenResponse, verifyRepCredentials } from '../../_lib/rep-login';

/**
 * POST /api/medical-representatives/auth/token
 * Body: { email, password }
 *
 * Mobile sign-in for medical representatives. Returns the session JWT in the body instead of
 * a cookie; send it as `Authorization: Bearer <token>` to every /api/medical-representatives/*
 * endpoint. Tokens live 7 days and are revoked by a password change or
 * DELETE /api/medical-representatives/session?all=true.
 *
 * Accounts with two-step sign-in get `{ requires2fa: true, pendingToken }` (401) instead;
 * finish with POST /api/medical-representatives/auth/2fa within 5 minutes.
 */
export async function POST(request: NextRequest) {
  try {
    const result = await verifyRepCredentials(request);
    if (!result.ok) return result.response;
    const creds = result.value;

    if (creds.user.totpEnabled) {
      const pendingToken = await issuePending2faToken(creds.user._id.toString(), creds.tenantId ?? undefined);
      return NextResponse.json(
        {
          success: false,
          requires2fa: true,
          pendingToken,
          error: 'Two-factor authentication required.',
        },
        { status: 401 }
      );
    }

    return await repTokenResponse(request, creds);
  } catch (error: any) {
    console.error('Medical representative token error:', error);
    return NextResponse.json({ success: false, error: 'Failed to sign in' }, { status: 500 });
  }
}
