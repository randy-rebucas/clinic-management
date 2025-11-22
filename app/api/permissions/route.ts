import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Permission from '@/models/Permission';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse } from '@/app/lib/auth-helpers';

// GET all permissions - admin only
export async function GET(request: NextRequest) {
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const roleId = searchParams.get('roleId');
    const resource = searchParams.get('resource');

    let query: any = {};
    if (userId) {
      query.user = userId;
    }
    if (roleId) {
      query.role = roleId;
    }
    if (resource) {
      query.resource = resource;
    }

    const permissions = await Permission.find(query)
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
  const session = await verifySession();
  
  if (!session) {
    return unauthorizedResponse();
  }

  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required');
  }

  try {
    await connectDB();
    const body = await request.json();

    // Validate that either user or role is provided, but not both
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

    const permission = await Permission.create(body);
    await permission.populate('user', 'name email');
    await permission.populate('role', 'name displayName');

    // If permission is for a user, add it to user's permissions array
    if (body.user) {
      const User = (await import('@/models/User')).default;
      await User.findByIdAndUpdate(body.user, {
        $addToSet: { permissions: permission._id }
      });
    }

    // If permission is for a role, add it to role's permissions array
    if (body.role) {
      const Role = (await import('@/models/Role')).default;
      await Role.findByIdAndUpdate(body.role, {
        $addToSet: { permissions: permission._id }
      });
    }

    return NextResponse.json({ success: true, data: permission }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating permission:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create permission' },
      { status: 500 }
    );
  }
}

