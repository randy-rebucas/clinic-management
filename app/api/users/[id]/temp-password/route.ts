import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { revokeUserSessions } from '@/app/lib/dal';
import { createAuditLog } from '@/lib/audit';
import { encryptData } from '@/lib/encryption';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import { generateTempPassword } from '@/lib/user-invite';

const ADMIN_LIMIT = { name: 'user-temp-password-admin', windowMs: 60 * 60 * 1000, maxRequests: 30 };

/**
 * POST /api/users/:id/temp-password — admin only, same clinic, not your own account.
 * Replaces the account's password with a generated temporary one and returns it. Admins can read it
 * on the staff list until the person sets their own. Any pending invite link stops working, and
 * existing sessions are signed out since the old password no longer works.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Admin access required');

  try {
    const { id } = await params;
    if (!isValidId(id)) return notFound('User');
    if (id === session.userId) {
      return NextResponse.json({ success: false, error: 'Change your own password from your account page.' }, { status: 400 });
    }

    const limit = await consumeRateLimit(ADMIN_LIMIT, getClientIp(request.headers), `admin:${session.userId}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many temporary passwords made, please try again later', retryAfter: limit.retryAfter },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }
      );
    }

    await connectDB();
    const target = tenantFilter(tenantId, { _id: id });
    const existing = await User.findOne(target).select('status medicalRepresentativeProfile').lean<{ status?: string; medicalRepresentativeProfile?: unknown } | null>();
    if (!existing) return notFound('User');
    if (existing.medicalRepresentativeProfile) {
      return NextResponse.json({ success: false, error: 'Medical representatives manage their password in the mobile app.' }, { status: 400 });
    }
    if (existing.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'This account is suspended or closed. Reactivate it before giving it a password.' },
        { status: 409 }
      );
    }

    const tempPassword = generateTempPassword();
    await User.updateOne(target, {
      $set: { password: await bcrypt.hash(tempPassword, 12), mustSetPassword: false, tempPassword: encryptData(tempPassword) },
      $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 },
    });
    await revokeUserSessions(id);

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'update',
      resource: 'user',
      resourceId: id,
      description: 'Set a temporary password',
    });

    return NextResponse.json({ success: true, data: { tempPassword } });
  } catch (error) {
    console.error('Error setting temporary password:', (error as Error)?.message);
    return NextResponse.json({ success: false, error: 'Failed to make a temporary password' }, { status: 500 });
  }
}
