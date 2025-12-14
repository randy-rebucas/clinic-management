import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Role from '@/models/Role';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';

// Update user's role - admin only
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');
    
    const { id } = await params;
    const body = await request.json();
    const { roleId } = body;

    if (!roleId) {
      return NextResponse.json(
        { success: false, error: 'roleId is required' },
        { status: 400 }
      );
    }

    // Verify role exists (tenant-scoped)
    const roleQuery: any = { _id: roleId };
    if (tenantId) {
      roleQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      roleQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const role = await Role.findOne(roleQuery);
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    // Update user's role (tenant-scoped)
    const userQuery: any = { _id: id };
    if (tenantId) {
      userQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      userQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter
    const rolePopulateOptions: any = {
      path: 'role',
      select: 'name displayName',
    };
    if (tenantId) {
      rolePopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      rolePopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const user = await User.findOneAndUpdate(
      userQuery,
      { role: roleId },
      { new: true }
    )
      .select('-password')
      .populate(rolePopulateOptions)
      .lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}

