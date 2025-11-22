import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Permission from '@/models/Permission';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';

// GET single permission - admin only
export async function GET(
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
    const permission = await Permission.findById(id)
      .populate('user', 'name email')
      .populate('role', 'name displayName')
      .lean();

    if (!permission) {
      return NextResponse.json(
        { success: false, error: 'Permission not found' },
        { status: 404 }
      );
    }

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

    const permission = await Permission.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('user', 'name email')
      .populate('role', 'name displayName');

    if (!permission) {
      return NextResponse.json(
        { success: false, error: 'Permission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: permission });
  } catch (error: any) {
    console.error('Error updating permission:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
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
    
    const permission = await Permission.findById(id);
    if (!permission) {
      return NextResponse.json(
        { success: false, error: 'Permission not found' },
        { status: 404 }
      );
    }

    // Remove permission from user or role
    if (permission.user) {
      const User = (await import('@/models/User')).default;
      await User.findByIdAndUpdate(permission.user, {
        $pull: { permissions: id }
      });
    }

    if (permission.role) {
      const Role = (await import('@/models/Role')).default;
      await Role.findByIdAndUpdate(permission.role, {
        $pull: { permissions: id }
      });
    }

    await Permission.findByIdAndDelete(id);

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting permission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete permission' },
      { status: 500 }
    );
  }
}

