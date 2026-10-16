import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { User, Role } from '@/models';
import { isAdmin } from '@/app/lib/auth-helpers';
import { sanitizeSearch } from '@/lib/utils';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail, zObjectId } from '@/lib/api/validate';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { validatePasswordPolicy } from '@/lib/user-invite';

const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: zEmail,
  password: z.string().min(8).max(200),
  role: zObjectId,
  status: z.enum(USER_STATUSES).optional(),
});

// GET /api/users - Get all users
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
    const skip = (page - 1) * limit;

    const extra: Record<string, unknown> = {};
    if (status && (USER_STATUSES as readonly string[]).includes(status)) extra.status = status;
    if (role) {
      if (!isValidId(role)) {
        return NextResponse.json({ success: true, data: [], pagination: { page, limit, total: 0, pages: 0 } });
      }
      extra.role = role;
    }
    if (search) {
      const safeSearch = sanitizeSearch(search);
      extra.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const query = tenantFilter(tenantId, extra);

    const [users, total] = await Promise.all([
      User.find(query)
        .populate({ path: 'role', select: 'name displayName level', match: tenantFilter(tenantId) })
        .select('-password -totpSecret')
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
    return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/users - Create a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId, tenantObjectId } = ctx;

    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const parsed = await parseBody(request, createUserSchema);
    if (isValidationError(parsed)) return parsed;
    const { name, email, password, role, status } = parsed.data;

    const passwordErrors = validatePasswordPolicy(password, { email, name });
    if (passwordErrors.length > 0) {
      return NextResponse.json({ success: false, error: passwordErrors.join(' ') }, { status: 400 });
    }

    const limitCheck = await checkSubscriptionLimit(tenantId, 'createUser');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason || 'Subscription limit exceeded',
          limit: limitCheck.limit,
          current: limitCheck.current,
          remaining: limitCheck.remaining,
        },
        { status: 403 }
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'User with this email already exists' }, { status: 400 });
    }

    const roleDoc = await Role.findOne(tenantFilter(tenantId, { _id: role }));
    if (!roleDoc) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: roleDoc._id,
      status: status || 'active',
      tenantId: tenantObjectId,
    });

    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.totpSecret;

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
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 });
  }
}
