import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Permission from '@/models/Permission';
import { forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';

// The owning user/role (and tenant) of a permission are fixed; only its content can change.
const updatePermissionSchema = z.object({
  resource: z.string().trim().min(1).max(100).optional(),
  actions: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

// GET single permission - admin only
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
    const { id } = await params;
    if (!isValidId(id)) return notFound('Permission');

    const permission = await Permission.findOne(tenantFilter(tenantId, { _id: id }))
      .populate('user', 'name email')
      .populate('role', 'name displayName')
      .lean();

    if (!permission) return notFound('Permission');

    return NextResponse.json({ success: true, data: permission });
  } catch (error: any) {
    console.error('Error fetching permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch permission' },
      { status: 500 }
    );
  }
}

// PUT update permission - admin only
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
    if (!isValidId(id)) return notFound('Permission');

    const parsed = await parseBody(request, updatePermissionSchema);
    if (isValidationError(parsed)) return parsed;

    const permission = await Permission.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: parsed.data },
      { new: true, runValidators: true }
    )
      .populate('user', 'name email')
      .populate('role', 'name displayName');

    if (!permission) return notFound('Permission');

    return NextResponse.json({ success: true, data: permission });
  } catch (error: any) {
    console.error('Error updating permission:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid permission data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update permission' },
      { status: 500 }
    );
  }
}

// DELETE permission - admin only
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
    if (!isValidId(id)) return notFound('Permission');

    const permission = await Permission.findOne(tenantFilter(tenantId, { _id: id }));
    if (!permission) return notFound('Permission');

    if (permission.user) {
      const User = (await import('@/models/User')).default;
      await User.updateOne(tenantFilter(tenantId, { _id: permission.user }), {
        $pull: { permissions: permission._id },
      });
    }

    if (permission.role) {
      const Role = (await import('@/models/Role')).default;
      await Role.updateOne(tenantFilter(tenantId, { _id: permission.role }), {
        $pull: { permissions: permission._id },
      });
    }

    await Permission.deleteOne(tenantFilter(tenantId, { _id: id }));

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete permission' },
      { status: 500 }
    );
  }
}
