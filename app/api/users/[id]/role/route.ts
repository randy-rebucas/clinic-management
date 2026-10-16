import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Role from '@/models/Role';
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { revokeUserSessions } from '@/app/lib/dal';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

const updateUserRoleSchema = z.object({ roleId: zObjectId });

// Update user's role - admin only
export async function PUT(
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
    await connectDB();

    const { id } = await params;
    if (!isValidId(id)) return notFound('User');

    const parsed = await parseBody(request, updateUserRoleSchema);
    if (isValidationError(parsed)) return parsed;
    const { roleId } = parsed.data;

    if (id === session.userId) {
      return NextResponse.json(
        { success: false, error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    const role = await Role.findOne(tenantFilter(tenantId, { _id: roleId }));
    if (!role) return notFound('Role');

    const user = await User.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: { role: role._id } },
      { new: true }
    )
      .select('-password -totpSecret')
      .populate({ path: 'role', select: 'name displayName', match: tenantFilter(tenantId) })
      .lean();

    if (!user) return notFound('User');

    // Sessions carry the role; force the user to sign in again with the new one.
    await revokeUserSessions(id);

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'permission_change',
      resource: 'user',
      resourceId: id,
      description: `Changed role for user ${id} to ${role.name}`,
      changes: [{ field: 'role', newValue: role.name }],
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}
