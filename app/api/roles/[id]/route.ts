import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission'; // Import to register model for populate
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText } from '@/lib/api/validate';

const updateRoleSchema = z.object({
  // Role names are fixed system identifiers; the UI echoes the current name back, so it is
  // accepted only when unchanged (checked below).
  name: z.string().optional(),
  displayName: zShortText.min(1).optional(),
  description: z.string().trim().max(1000).optional(),
  level: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  defaultPermissions: z
    .array(
      z.object({
        resource: z.string().trim().min(1).max(100),
        actions: z.array(z.string().trim().min(1).max(50)).max(20),
      })
    )
    .max(100)
    .optional(),
});

function ensurePermissionModel() {
  if (!mongoose.models.Permission) {
    void Permission;
  }
}

// GET single role - admin only
export async function GET(
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
    ensurePermissionModel();

    const { id } = await params;
    if (!isValidId(id)) return notFound('Role');

    const role = await Role.findOne(tenantFilter(tenantId, { _id: id }))
      .populate({ path: 'permissions', select: 'resource actions', match: tenantFilter(tenantId) })
      .lean();

    if (!role) return notFound('Role');

    return NextResponse.json({ success: true, data: role });
  } catch (error: any) {
    console.error('Error fetching role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch role' },
      { status: 500 }
    );
  }
}

// PUT update role - admin only
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
    ensurePermissionModel();

    const { id } = await params;
    if (!isValidId(id)) return notFound('Role');

    const parsed = await parseBody(request, updateRoleSchema);
    if (isValidationError(parsed)) return parsed;
    const { name, ...updates } = parsed.data;

    const role = await Role.findOne(tenantFilter(tenantId, { _id: id }));
    if (!role) return notFound('Role');

    if (name !== undefined && name !== role.name) {
      return NextResponse.json(
        { success: false, error: 'Role name cannot be changed' },
        { status: 400 }
      );
    }

    if (role.name === 'admin' && updates.isActive === false) {
      return NextResponse.json(
        { success: false, error: 'Cannot deactivate system role (admin)' },
        { status: 400 }
      );
    }

    const updatedRole = await Role.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: updates },
      { new: true, runValidators: true }
    ).populate({ path: 'permissions', select: 'resource actions', match: tenantFilter(tenantId) });

    const changes = Object.entries(updates)
      .map(([field, newValue]) => ({ field, oldValue: (role as unknown as Record<string, unknown>)[field], newValue }))
      .filter((c) => c.oldValue !== c.newValue);
    if (changes.length > 0) {
      await createAuditLog({
        userId: session.userId,
        userEmail: session.email,
        userRole: session.role,
        tenantId,
        action: 'update',
        resource: 'user',
        resourceId: id,
        description: `Changed the ${role.displayName || role.name} role’s details`,
        changes,
      });
    }

    return NextResponse.json({ success: true, data: updatedRole });
  } catch (error: any) {
    console.error('Error updating role:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid role data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update role' },
      { status: 500 }
    );
  }
}

// DELETE role - admin only (with safety checks)
export async function DELETE(
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

    const role = await Role.findOne(tenantFilter(tenantId, { _id: id }));
    if (!role) return notFound('Role');

    if (role.name === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete system role (admin)' },
        { status: 400 }
      );
    }

    const User = (await import('@/models/User')).default;
    const usersWithRole = await User.countDocuments({ role: role._id });

    if (usersWithRole > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete role: ${usersWithRole} user(s) are assigned this role` },
        { status: 400 }
      );
    }

    await Role.deleteOne(tenantFilter(tenantId, { _id: id }));
    await Permission.deleteMany(tenantFilter(tenantId, { role: role._id }));

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'delete',
      resource: 'user',
      resourceId: id,
      description: `Deleted role: ${role.name}`,
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete role' },
      { status: 500 }
    );
  }
}
