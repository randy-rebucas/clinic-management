import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { consumeRefreshToken, revokeRefreshFamily } from '@/app/lib/refresh-tokens';
import { issueRepAppTokens, loadActiveRep } from '../../_lib/rep-login';

/**
 * POST /api/medical-representatives/auth/refresh
 * Body: { refreshToken }
 *
 * Trade a refresh token for a new Bearer token and a new refresh token (the old one is spent).
 * 401 `REFRESH_INVALID`: unknown, expired, revoked, account no longer active, or the rep signed
 * out everywhere / changed their password. 401 `REFRESH_REUSED`: the token was already spent,
 * so every token in its chain is revoked. Either way the app must sign in again.
 */
export async function POST(request: NextRequest) {
  // Not the strict sign-in limit: refresh tokens are 256-bit random (nothing to guess), and
  // many phones share one carrier IP.
  const limited = await applyRateLimit(request, rateLimiters.api);
  if (limited) return limited;

  let body: { refreshToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body. Expected JSON.' }, { status: 400 });
  }

  const invalid = (code: string) =>
    NextResponse.json({ success: false, error: 'Please sign in again.', code }, { status: 401 });

  try {
    const consumed = await consumeRefreshToken(body.refreshToken, 'user');
    if (!consumed.ok) return invalid(consumed.code);
    const { subjectId, sessionVersion, family } = consumed.value;

    const rep = await loadActiveRep(subjectId);
    if (!rep || (rep.user.sessionVersion ?? 0) !== sessionVersion) {
      await revokeRefreshFamily(family);
      return invalid('REFRESH_INVALID');
    }

    return NextResponse.json({
      success: true,
      ...(await issueRepAppTokens(rep.user, rep.roleId, family)),
    });
  } catch (error: any) {
    console.error('Medical representative token refresh error:', error);
    return NextResponse.json({ success: false, error: 'Failed to refresh session' }, { status: 500 });
  }
}
