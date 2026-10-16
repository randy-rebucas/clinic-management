import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { Nurse, Receptionist, Accountant, User } from '@/models';
import { isAdmin } from '@/app/lib/auth-helpers';
import { sanitizeSearch } from '@/lib/utils';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail, zPhone, zShortText } from '@/lib/api/validate';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';

const STAFF_STATUSES = ['active', 'inactive', 'on-leave'] as const;

const optionalText = z.preprocess((v) => (v === '' || v === null ? undefined : v), zShortText.optional());
const optionalDate = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.date().optional()
);

const createStaffSchema = z.object({
  staffType: z.enum(['nurse', 'receptionist', 'accountant']),
  firstName: zShortText.min(1),
  lastName: zShortText.min(1),
  email: zEmail,
  phone: zPhone,
  employeeId: optionalText,
  department: optionalText,
  specialization: optionalText,
  licenseNumber: optionalText,
  certification: optionalText,
  title: optionalText,
  address: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(500).optional()),
  bio: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().max(5000).optional()),
  hireDate: optionalDate,
  status: z.enum(STAFF_STATUSES).optional(),
});

// GET /api/staff - Get all staff members (nurses, receptionists, accountants)
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { tenantId } = ctx;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'nurse', 'receptionist', 'accountant', or 'all'
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const skip = (page - 1) * limit;

    const buildQuery = () => {
      const extra: Record<string, unknown> = {};
      if (status && (STAFF_STATUSES as readonly string[]).includes(status)) extra.status = status;
      if (search) {
        const safeSearch = sanitizeSearch(search);
        extra.$or = [
          { firstName: { $regex: safeSearch, $options: 'i' } },
          { lastName: { $regex: safeSearch, $options: 'i' } },
          { email: { $regex: safeSearch, $options: 'i' } },
          { employeeId: { $regex: safeSearch, $options: 'i' } },
        ];
      }
      return tenantFilter(tenantId, extra);
    };

    const results: any = { nurses: [], receptionists: [], accountants: [] };
    let totalCount = 0;

    if (!type || type === 'all' || type === 'nurse') {
      const nurseQuery = buildQuery();
      const [nurses, nurseCount] = await Promise.all([
        Nurse.find(nurseQuery).sort({ createdAt: -1 }).skip(type === 'nurse' ? skip : 0).limit(type === 'nurse' ? limit : 100).lean(),
        Nurse.countDocuments(nurseQuery),
      ]);
      results.nurses = nurses.map((n: any) => ({ ...n, staffType: 'nurse' }));
      if (type === 'nurse') totalCount = nurseCount;
    }

    if (!type || type === 'all' || type === 'receptionist') {
      const receptionistQuery = buildQuery();
      const [receptionists, receptionistCount] = await Promise.all([
        Receptionist.find(receptionistQuery).sort({ createdAt: -1 }).skip(type === 'receptionist' ? skip : 0).limit(type === 'receptionist' ? limit : 100).lean(),
        Receptionist.countDocuments(receptionistQuery),
      ]);
      results.receptionists = receptionists.map((r: any) => ({ ...r, staffType: 'receptionist' }));
      if (type === 'receptionist') totalCount = receptionistCount;
    }

    if (!type || type === 'all' || type === 'accountant') {
      const accountantQuery = buildQuery();
      const [accountants, accountantCount] = await Promise.all([
        Accountant.find(accountantQuery).sort({ createdAt: -1 }).skip(type === 'accountant' ? skip : 0).limit(type === 'accountant' ? limit : 100).lean(),
        Accountant.countDocuments(accountantQuery),
      ]);
      results.accountants = accountants.map((a: any) => ({ ...a, staffType: 'accountant' }));
      if (type === 'accountant') totalCount = accountantCount;
    }

    if (!type || type === 'all') {
      const allStaff = [
        ...results.nurses,
        ...results.receptionists,
        ...results.accountants,
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      totalCount = allStaff.length;
      const paginatedStaff = allStaff.slice(skip, skip + limit);

      return NextResponse.json({
        staff: paginatedStaff,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
        counts: {
          nurses: results.nurses.length,
          receptionists: results.receptionists.length,
          accountants: results.accountants.length,
        },
      });
    }

    const staffList = type === 'nurse' ? results.nurses :
                      type === 'receptionist' ? results.receptionists :
                      results.accountants;

    return NextResponse.json({
      staff: staffList,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
  }
}

// POST /api/staff - Create a new staff member
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId, tenantObjectId } = ctx;

    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Only admins can create staff' }, { status: 403 });
    }

    await connectDB();

    const parsed = await parseBody(request, createStaffSchema);
    if (isValidationError(parsed)) return parsed;
    const { staffType, ...staffData } = parsed.data;

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

    // The model's post-save hook links an existing User by email; never let that reach
    // an account that belongs to another clinic.
    const existingUser = await User.findOne({ email: staffData.email }).select('tenantId').lean<{ tenantId?: unknown } | null>();
    if (existingUser && String(existingUser.tenantId ?? '') !== tenantId) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    const doc = { ...staffData, tenantId: tenantObjectId };
    let staff;
    switch (staffType) {
      case 'nurse':
        staff = await Nurse.create(doc);
        break;
      case 'receptionist':
        staff = await Receptionist.create(doc);
        break;
      case 'accountant':
        staff = await Accountant.create(doc);
        break;
    }

    // The post-save hook creates the User account; give it a moment before reading it back.
    await new Promise(resolve => setTimeout(resolve, 500));

    const profileField = `${staffType}Profile`;
    const user = await User.findOne(tenantFilter(tenantId, { [profileField]: staff._id })).lean();

    return NextResponse.json({
      message: `${staffType.charAt(0).toUpperCase() + staffType.slice(1)} created successfully`,
      staff: { ...staff.toObject(), staffType },
      user: user && !Array.isArray(user) ? { email: user.email, name: user.name } : null,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating staff:', error);
    if (error.code === 11000) {
      return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 400 });
    }
    if (error.name === 'ValidationError') {
      return NextResponse.json({ error: 'Invalid staff data' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create staff' }, { status: 500 });
  }
}
