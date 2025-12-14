import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { User, Role } from '@/models';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// GET /api/users - Get all users
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view all users
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (status) query.status = status;
    if (role) query.role = role;
    if (search) {
      const searchConditions = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
      
      // Combine tenant filter with search conditions
      const tenantFilter: any = {};
      if (tenantId) {
        tenantFilter.tenantId = new Types.ObjectId(tenantId);
      } else {
        tenantFilter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      query.$and = [
        tenantFilter,
        { $or: searchConditions }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .populate('role', 'name displayName level')
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/users - Create a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { name, email, password, role, status } = body;

    if (!name || !email || !password || !role) {
      return NextResponse.json({ success: false, error: 'Name, email, password, and role are required' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'User with this email already exists' }, { status: 400 });
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Verify role exists (tenant-scoped)
    const roleQuery: any = { _id: role };
    if (tenantId) {
      roleQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      roleQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    const roleDoc = await Role.findOne(roleQuery);
    if (!roleDoc) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Ensure user is created with tenantId
    const userData: any = {
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
      status: status || 'active',
    };
    if (tenantId && !userData.tenantId) {
      userData.tenantId = new Types.ObjectId(tenantId);
    }

    const user = await User.create(userData);

    // Return user without password
    const userObj = user.toObject();
    delete userObj.password;

    return NextResponse.json({
      success: true,
      data: userObj,
      message: 'User created successfully',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 11000) {
      return NextResponse.json({ success: false, error: 'User with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to create user' }, { status: 500 });
  }
}

