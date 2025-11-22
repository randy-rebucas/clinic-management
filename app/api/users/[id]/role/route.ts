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
    const { id } = await params;
    const body = await request.json();
    const { roleId } = body;

    if (!roleId) {
      return NextResponse.json(
        { success: false, error: 'roleId is required' },
        { status: 400 }
      );
    }

    // Verify role exists
    const role = await Role.findById(roleId);
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    // Update user's role
    const user = await User.findByIdAndUpdate(
      id,
      { role: roleId },
      { new: true }
    )
      .select('-password')
      .populate('role', 'name displayName')
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

