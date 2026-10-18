import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission'; // Import to register model for populate
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { ROLE_NAMES, STANDARD_ROLE } from '@/lib/roles';

// Roles are the fixed set in lib/roles.ts; "creating" one adds a standard role this clinic lacks.
const createRoleSchema = z.object({
  name: z.enum(ROLE_NAMES),
  displayName: zShortText.min(1).optional(),
  description: z.string().trim().max(1000).optional(),
});

// GET all roles - admin only
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  try {
    await connectDB();

    if (!isAdmin(session)) {
      // Double-check against database (handles session role mismatch)
      const User = (await import('@/models/User')).default;
      const user = await User.findOne(tenantFilter(tenantId, { _id: session.userId }))
        .populate('role', 'name')
        .lean();
      const roleName = (user as any)?.role && typeof (user as any).role === 'object'
        ? (user as any).role.name
        : null;
      if (roleName !== 'admin') {
        return forbiddenResponse('Admin access required');
      }
    }

    // Ensure Permission model is registered on mongoose before populate
    if (!mongoose.models.Permission) {
      void Permission;
    }

    const roles = await Role.find(tenantFilter(tenantId))
      .populate({ path: 'permissions', select: 'resource actions', match: tenantFilter(tenantId) })
      .sort({ level: -1, name: 1 })
      .lean()
      .exec();

    const rolesData = Array.isArray(roles) ? roles : [];

    return NextResponse.json({ success: true, data: rolesData });
  } catch (error: any) {
    console.error('Error fetching roles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch roles' },
      { status: 500 }
    );
  }
}

// POST add a standard role this clinic doesn't have yet - admin only. The role starts with the
// standard access for its kind (the same as a new clinic gets).
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createRoleSchema);
    if (isValidationError(parsed)) return parsed;
    const { name } = parsed.data;
    const standard = STANDARD_ROLE[name];
    const access = DEFAULT_ROLE_PERMISSIONS[name] ?? [];

    const role = await Role.create({
      tenantId: tenantObjectId,
      name,
      displayName: parsed.data.displayName || standard.displayName,
      description: parsed.data.description || standard.description,
      level: standard.level,
      isActive: true,
      defaultPermissions: access,
    });
    const docs = await Permission.insertMany(
      access.map((p) => ({ tenantId: tenantObjectId, role: role._id, resource: p.resource, actions: p.actions }))
    );
    role.permissions = docs.map((d) => d._id);
    await role.save();

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'create',
      resource: 'user',
      resourceId: role._id,
      description: `Added the ${role.displayName} role`,
    });

    return NextResponse.json({ success: true, data: { _id: String(role._id), name: role.name, displayName: role.displayName } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating role:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid role data' },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'This clinic already has that role' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create role' },
      { status: 500 }
    );
  }
}
