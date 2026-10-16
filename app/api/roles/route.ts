import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission'; // Import to register model for populate
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText } from '@/lib/api/validate';

const ROLE_NAMES = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'] as const;

const defaultPermissionSchema = z.object({
  resource: z.string().trim().min(1).max(100),
  actions: z.array(z.string().trim().min(1).max(50)).max(20),
});

const createRoleSchema = z.object({
  name: z.enum(ROLE_NAMES),
  displayName: zShortText.min(1),
  description: z.string().trim().max(1000).optional(),
  level: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  defaultPermissions: z.array(defaultPermissionSchema).max(100).optional(),
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

// POST create new role - admin only
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createRoleSchema);
    if (isValidationError(parsed)) return parsed;

    const role = await Role.create({ ...parsed.data, tenantId: tenantObjectId });
    await role.populate('permissions', 'resource actions');

    return NextResponse.json({ success: true, data: role }, { status: 201 });
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
        { success: false, error: 'Role with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create role' },
      { status: 500 }
    );
  }
}
