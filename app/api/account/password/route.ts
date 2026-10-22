import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createAuditLog } from '@/lib/audit';
import { applyRateLimit, getClientIp, rateLimiters } from '@/lib/middleware/rate-limit';
import { validatePasswordPolicy } from '@/lib/user-invite';
import { signOutOtherSessions } from '@/lib/account';

/**
 * POST /api/account/password
 * Body: { currentPassword, newPassword }
 * Changes the signed-in user's password, signs out every other session and gives this
 * browser a fresh one.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `staff-pw:${session.userId}`);
  if (limited) return limited;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!currentPassword) {
    return NextResponse.json(
      { success: false, error: 'Check the highlighted fields.', fieldErrors: { currentPassword: ['Enter your current password.'] } },
      { status: 400 }
    );
  }

  try {
    await connectDB();
    const user = await User.findById(session.userId)
      .select('+password email name tenantId')
      .lean<{ password?: string; email: string; name?: string } | null>();
    if (!user?.password) return unauthorizedResponse();

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json(
        { success: false, error: 'Check the highlighted fields.', fieldErrors: { currentPassword: ['That is not your current password.'] } },
        { status: 400 }
      );
    }

    const policyErrors = validatePasswordPolicy(newPassword, { email: user.email, name: user.name });
    if (await bcrypt.compare(newPassword, user.password)) {
      policyErrors.push('Choose a password you are not already using.');
    }
    if (policyErrors.length) {
      return NextResponse.json(
        { success: false, error: 'Check the highlighted fields.', fieldErrors: { newPassword: policyErrors } },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(newPassword, 12);
    // An emailed set-password link still waiting in the inbox dies with the old password.
    await User.updateOne({ _id: session.userId }, { $set: { password: hash }, $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 } });
    await signOutOtherSessions(session);

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: session.tenantId,
      action: 'password_change',
      resource: 'user',
      resourceId: session.userId,
      description: 'Changed own password; other sessions signed out',
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error changing own password:', error?.message);
    return NextResponse.json({ success: false, error: 'Could not change your password. Try again.' }, { status: 500 });
  }
}
