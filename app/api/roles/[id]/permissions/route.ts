import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';

// Update role permissions - admin only
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
    const { defaultPermissions, permissionIds } = body;

    // Build query with tenant filter
    const roleQuery: any = { _id: id };
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

    // Update default permissions if provided
    if (defaultPermissions !== undefined) {
      role.defaultPermissions = defaultPermissions;
    }

    // Update permission references if provided (tenant-scoped)
    if (permissionIds !== undefined) {
      // Validate all permission IDs exist (tenant-scoped)
      if (permissionIds.length > 0) {
        const permissionQuery: any = { _id: { $in: permissionIds } };
        if (tenantId) {
          permissionQuery.tenantId = new Types.ObjectId(tenantId);
        } else {
          permissionQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
        }
        
        const permissions = await Permission.find(permissionQuery);
        if (permissions.length !== permissionIds.length) {
          return NextResponse.json(
            { success: false, error: 'Some permission IDs are invalid' },
            { status: 400 }
          );
        }
      }
      role.permissions = permissionIds;
    }

    await role.save();
    
    // Build populate options with tenant filter
    const permissionPopulateOptions: any = {
      path: 'permissions',
      select: 'resource actions',
    };
    if (tenantId) {
      permissionPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      permissionPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await role.populate(permissionPopulateOptions);

    return NextResponse.json({ success: true, data: role });
  } catch (error: any) {
    console.error('Error updating role permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update role permissions' },
      { status: 500 }
    );
  }
}

