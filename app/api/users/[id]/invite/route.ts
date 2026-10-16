import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import { generateInviteToken, inviteUpdate, sendSetPasswordEmail } from '@/lib/user-invite';

const ADMIN_LIMIT = { name: 'user-invite-admin', windowMs: 60 * 60 * 1000, maxRequests: 30 };
// Per target account, so one inbox cannot be flooded
const TARGET_LIMIT = { name: 'user-invite-target', windowMs: 60 * 60 * 1000, maxRequests: 5, identifierOnly: true };

// `?profile=nurse` means :id is that staff profile's id rather than the user id (staff screens only know profile ids).
const PROFILE_FIELDS: Record<string, string> = {
  doctor: 'doctorProfile',
  nurse: 'nurseProfile',
  receptionist: 'receptionistProfile',
  accountant: 'accountantProfile',
  admin: 'adminProfile',
};

/**
 * POST /api/users/:id/invite[?profile=nurse|receptionist|accountant|doctor|admin] — admin only, same clinic.
 * Issues a fresh single-use set-password link (the previous link stops working) and emails it.
 * For a user who never set a password this re-sends the invitation; for anyone else it is an
 * admin-triggered password reset (the current password keeps working until the link is used).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  if (!isAdmin(session)) {
    return forbiddenResponse('Admin access required');
  }

  try {
    const { id } = await params;
    if (!isValidId(id)) return notFound('User');
    const profile = request.nextUrl.searchParams.get('profile');
    const profileField = profile ? PROFILE_FIELDS[profile] : undefined;
    if (profile && !profileField) {
      return NextResponse.json({ success: false, error: 'Invalid profile type' }, { status: 400 });
    }

    const ip = getClientIp(request.headers);
    const checks = [
      await consumeRateLimit(ADMIN_LIMIT, ip, `admin:${session.userId}`),
      await consumeRateLimit(TARGET_LIMIT, ip, `target:${id}`),
    ];
    const blocked = checks.find((c) => !c.allowed);
    if (blocked) {
      return NextResponse.json(
        { success: false, error: 'Too many invitations sent, please try again later', retryAfter: blocked.retryAfter },
        { status: 429, headers: { 'Retry-After': String(blocked.retryAfter) } }
      );
    }

    await connectDB();

    const invite = generateInviteToken();
    const user = await User.findOneAndUpdate(
      tenantFilter(tenantId, profileField ? { [profileField]: id } : { _id: id }),
      { $set: inviteUpdate(invite) },
      { new: true, projection: { email: 1, name: 1, tenantId: 1, mustSetPassword: 1 } }
    ).lean<{ _id: unknown; email: string; name: string; tenantId?: unknown; mustSetPassword?: boolean } | null>();
    if (!user) return notFound('User');

    const kind = user.mustSetPassword ? 'invite' : 'reset';
    const delivery = await sendSetPasswordEmail({
      email: user.email,
      name: user.name,
      token: invite.token,
      tenantId,
      kind,
    });

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'update',
      resource: 'user',
      resourceId: id,
      description: kind === 'invite' ? 'Re-sent account invitation' : 'Sent password reset link',
      metadata: { delivery },
      success: delivery === 'sent',
    });

    if (delivery === 'not-configured') {
      return NextResponse.json(
        { success: false, error: 'Email is not configured on this server, so the link could not be sent.' },
        { status: 503 }
      );
    }
    if (delivery === 'failed') {
      return NextResponse.json(
        { success: false, error: 'The email could not be sent. Please try again later.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { kind, expiresAt: invite.expiresAt.toISOString() },
    });
  } catch (error) {
    console.error('Error sending user invite:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send invitation' },
      { status: 500 }
    );
  }
}
