import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { withTenantFilter } from '@/app/lib/api-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can view all staff
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const department = searchParams.get('department');

    // Build query with tenant filtering
    let query: any = await withTenantFilter({});
    
    // Handle role filter - if role is provided as string (role name), find the Role document
    if (role) {
      const Role = (await import('@/models/Role')).default;
      // First try to find by role name
      const roleDoc = await Role.findOne({ name: role });
      if (roleDoc) {
        query.role = roleDoc._id;
      } else if (mongoose.Types.ObjectId.isValid(role)) {
        // If not found by name, try as ObjectId
        query.role = new mongoose.Types.ObjectId(role);
      }
      // If neither works, skip the role filter
    }
    
    if (status) {
      query.status = status;
    }
    if (department) {
      query['staffInfo.department'] = department;
    }

    const staff = await User.find(query)
      .select('-password')
      .populate('role', 'name displayName')
      .populate('doctorProfile', 'firstName lastName specialization')
      .populate('staffInfo', 'employeeId department position')
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: staff });
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch staff' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can create staff
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json();

    // Hash password
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(body.password, 10);

    // Add tenantId to the user data
    const tenantFilter = await withTenantFilter({});
    
    const user = await User.create({
      ...body,
      password: hashedPassword,
      tenantId: tenantFilter.tenantId,
    });

    // Remove password from response
    const userObj = user.toObject();
    delete userObj.password;

    return NextResponse.json({ success: true, data: userObj }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating staff:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'User with this email already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create staff' },
      { status: 500 }
    );
  }
}

