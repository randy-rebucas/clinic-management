import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { revokeUserSessions } from '@/app/lib/dal';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';

/**
 * DELETE /api/users/:id/sessions — admin only, same clinic. Signs the person out on every
 * device (a lost phone, a shared computer). Their password keeps working; your own
 * sessions are ended from Sign-in & security instead.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Admin access required');

  try {
    const { id } = await params;
    if (!isValidId(id)) return notFound('User');
    if (id === session.userId) {
      return NextResponse.json({ success: false, error: 'Sign out your own other devices from Sign-in & security.' }, { status: 400 });
    }

    await connectDB();
    const user = await User.findOne(tenantFilter(tenantId, { _id: id })).select('name').lean<{ name: string } | null>();
    if (!user) return notFound('User');

    await revokeUserSessions(id);
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'update',
      resource: 'user',
      resourceId: id,
      description: `Signed ${user.name} out on every device`,
    });

    return NextResponse.json({ success: true, data: { signedOut: true } });
  } catch (error) {
    console.error('Error ending user sessions:', error);
    return NextResponse.json({ success: false, error: 'Failed to sign them out' }, { status: 500 });
  }
}
