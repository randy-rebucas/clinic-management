import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { applyRateLimit, getClientIp, rateLimiters } from '@/lib/middleware/rate-limit';
import { signOutOtherSessions } from '@/lib/account';

/**
 * DELETE /api/account/sessions
 * Signs the user out everywhere else (other browsers, the mobile app, calendar feed links);
 * this browser stays signed in.
 */
export async function DELETE(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `staff-sessions:${session.userId}`);
  if (limited) return limited;

  try {
    await signOutOtherSessions(session);
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: session.tenantId,
      action: 'logout',
      resource: 'user',
      resourceId: session.userId,
      description: 'Signed out of all other sessions',
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error signing out other sessions:', error?.message);
    return NextResponse.json({ success: false, error: 'Could not sign out other sessions. Try again.' }, { status: 500 });
  }
}
