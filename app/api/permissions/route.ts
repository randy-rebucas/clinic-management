import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Permission from '@/models/Permission';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, asString } from '@/lib/api/validate';

const createPermissionSchema = z.object({
  user: zObjectId.optional(),
  role: zObjectId.optional(),
  resource: z.string().trim().min(1).max(100),
  actions: z.array(z.string().trim().min(1).max(50)).max(20),
});

// GET all permissions - admin only
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  if (!isAdmin(session)) {
    return refuseAccess(session, 'Admin access required');
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const roleId = searchParams.get('roleId');
    const resource = asString(searchParams.get('resource'));

    const query: Record<string, unknown> = {};
    if (userId) {
      if (!isValidId(userId)) return NextResponse.json({ success: true, data: [] });
      query.user = userId;
    }
    if (roleId) {
      if (!isValidId(roleId)) return NextResponse.json({ success: true, data: [] });
      query.role = roleId;
    }
    if (resource) {
      query.resource = resource;
    }

    const permissions = await Permission.find(tenantFilter(tenantId, query))
      .populate('user', 'name email')
      .populate('role', 'name displayName')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: permissions });
  } catch (error: any) {
    console.error('Error fetching permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch permissions' },
      { status: 500 }
    );
  }
}

// POST create permission - admin only
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return refuseAccess(session, 'Admin access required');
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createPermissionSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    if (!body.user && !body.role) {
      return NextResponse.json(
        { success: false, error: 'Either user or role must be provided' },
        { status: 400 }
      );
    }

    if (body.user && body.role) {
      return NextResponse.json(
        { success: false, error: 'Cannot assign permission to both user and role' },
        { status: 400 }
      );
    }

    const User = (await import('@/models/User')).default;
    const Role = (await import('@/models/Role')).default;

    // The target user/role must belong to the caller's clinic.
    if (body.user && !(await User.exists(tenantFilter(tenantId, { _id: body.user })))) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    if (body.role && !(await Role.exists(tenantFilter(tenantId, { _id: body.role })))) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 404 });
    }

    const permission = await Permission.create({ ...body, tenantId: tenantObjectId });
    await permission.populate('user', 'name email');
    await permission.populate('role', 'name displayName');

    if (body.user) {
      await User.updateOne(tenantFilter(tenantId, { _id: body.user }), {
        $addToSet: { permissions: permission._id },
      });
    }

    if (body.role) {
      await Role.updateOne(tenantFilter(tenantId, { _id: body.role }), {
        $addToSet: { permissions: permission._id },
      });
    }

    return NextResponse.json({ success: true, data: permission }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating permission:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid permission data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create permission' },
      { status: 500 }
    );
  }
}
