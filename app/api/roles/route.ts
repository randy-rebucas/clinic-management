import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission'; // Import to register model for populate
import { forbiddenResponse, isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { createStandardRole } from '@/lib/standard-roles';
import { ROLE_NAMES } from '@/lib/roles';

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
    return refuseAccess(session, 'Admin access required');
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createRoleSchema);
    if (isValidationError(parsed)) return parsed;
    const { name } = parsed.data;
    const { role, created } = await createStandardRole(tenantObjectId, name, {
      displayName: parsed.data.displayName,
      description: parsed.data.description,
    });
    if (!created) {
      return NextResponse.json({ success: false, error: 'This clinic already has that role' }, { status: 409 });
    }

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
