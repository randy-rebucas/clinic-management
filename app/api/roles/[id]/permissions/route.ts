import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

const rolePermissionsSchema = z.object({
  defaultPermissions: z
    .array(
      z.object({
        resource: z.string().trim().min(1).max(100),
        actions: z.array(z.string().trim().min(1).max(50)).max(20),
      })
    )
    .max(100)
    .optional(),
  permissionIds: z.array(zObjectId).max(500).optional(),
});

// Update role permissions - admin only
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
    if (!isValidId(id)) return notFound('Role');

    const parsed = await parseBody(request, rolePermissionsSchema);
    if (isValidationError(parsed)) return parsed;
    const { defaultPermissions, permissionIds } = parsed.data;

    const role = await Role.findOne(tenantFilter(tenantId, { _id: id }));
    if (!role) return notFound('Role');

    if (defaultPermissions !== undefined) {
      role.defaultPermissions = defaultPermissions;
    }

    if (permissionIds !== undefined) {
      const uniqueIds = [...new Set(permissionIds)];
      if (uniqueIds.length > 0) {
        const count = await Permission.countDocuments(tenantFilter(tenantId, { _id: { $in: uniqueIds } }));
        if (count !== uniqueIds.length) {
          return NextResponse.json(
            { success: false, error: 'Some permission IDs are invalid' },
            { status: 400 }
          );
        }
      }
      role.permissions = uniqueIds;
    }

    await role.save();

    await role.populate({
      path: 'permissions',
      select: 'resource actions',
      match: tenantFilter(tenantId),
    });

    return NextResponse.json({ success: true, data: role });
  } catch (error: any) {
    console.error('Error updating role permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update role permissions' },
      { status: 500 }
    );
  }
}
