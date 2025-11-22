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
    const { id } = await params;
    const body = await request.json();
    const { defaultPermissions, permissionIds } = body;

    const role = await Role.findById(id);
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

    // Update permission references if provided
    if (permissionIds !== undefined) {
      // Validate all permission IDs exist
      if (permissionIds.length > 0) {
        const permissions = await Permission.find({ _id: { $in: permissionIds } });
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
    await role.populate('permissions', 'resource actions');

    return NextResponse.json({ success: true, data: role });
  } catch (error: any) {
    console.error('Error updating role permissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update role permissions' },
      { status: 500 }
    );
  }
}

