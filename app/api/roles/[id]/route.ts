import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission'; // Import to register model for populate
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';

// GET single role - admin only
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
    
    // Ensure Permission model is registered on mongoose before populate
    if (!mongoose.models.Permission) {
      const _ = Permission;
    }
    
    const { id } = await params;
    const role = await Role.findById(id)
      .populate('permissions', 'resource actions')
      .lean();

    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: role });
  } catch (error: any) {
    console.error('Error fetching role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch role' },
      { status: 500 }
    );
  }
}

// PUT update role - admin only
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
    
    // Ensure Permission model is registered on mongoose before populate
    if (!mongoose.models.Permission) {
      const _ = Permission;
    }
    
    const { id } = await params;
    const body = await request.json();

    // Don't allow changing role name if it's a system role
    const role = await Role.findById(id);
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    // Validate role name if provided
    const validRoleNames = ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'];
    if (body.name && !validRoleNames.includes(body.name)) {
      return NextResponse.json(
        { success: false, error: `Role name must be one of: ${validRoleNames.join(', ')}` },
        { status: 400 }
      );
    }

    const updatedRole = await Role.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('permissions', 'resource actions');

    return NextResponse.json({ success: true, data: updatedRole });
  } catch (error: any) {
    console.error('Error updating role:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update role' },
      { status: 500 }
    );
  }
}

// DELETE role - admin only (with safety checks)
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
    
    const role = await Role.findById(id);
    if (!role) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    // Prevent deletion of admin role
    if (role.name === 'admin') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete system role (admin)' },
        { status: 400 }
      );
    }

    // Check if any users have this role
    const User = (await import('@/models/User')).default;
    const usersWithRole = await User.countDocuments({ role: id });
    
    if (usersWithRole > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete role: ${usersWithRole} user(s) are assigned this role` },
        { status: 400 }
      );
    }

    await Role.findByIdAndDelete(id);

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting role:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete role' },
      { status: 500 }
    );
  }
}

