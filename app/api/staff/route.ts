import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { sanitizeSearch } from '@/lib/utils';
import {
  listStaffByType,
  listAllStaffTypes,
  createStaffProfile,
  createUserForStaff,
  StaffType,
} from '@/lib/data/staff';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET /api/staff - Get all staff members (nurses, receptionists, accountants)
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'nurse', 'receptionist', 'accountant', or 'all'
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    const filter = {
      status: status || undefined,
      search: search ? sanitizeSearch(search) : undefined,
    };

    if (!type || type === 'all') {
      const { nurses, receptionists, accountants } = await run(tenantId, () => listAllStaffTypes(filter));

      const allStaff = [...nurses, ...receptionists, ...accountants].sort(
        (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const totalCount = allStaff.length;
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
          nurses: nurses.length,
          receptionists: receptionists.length,
          accountants: accountants.length,
        },
      });
    }

    if (!['nurse', 'receptionist', 'accountant'].includes(type)) {
      return NextResponse.json({ error: 'Invalid staff type. Must be nurse, receptionist, or accountant' }, { status: 400 });
    }

    const { rows, count } = await run(tenantId, () => listStaffByType(type as StaffType, filter, { skip, take: limit }));

    return NextResponse.json({
      staff: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch staff' }, { status: 500 });
  }
}

// POST /api/staff - Create a new staff member
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create staff' }, { status: 403 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const body = await request.json();
    const { staffType, ...staffData } = body;

    if (!staffType || !['nurse', 'receptionist', 'accountant'].includes(staffType)) {
      return NextResponse.json({ error: 'Invalid staff type. Must be nurse, receptionist, or accountant' }, { status: 400 });
    }

    // Required fields validation
    if (!staffData.firstName || !staffData.lastName || !staffData.email || !staffData.phone) {
      return NextResponse.json({ error: 'First name, last name, email, and phone are required' }, { status: 400 });
    }

    const result = await run(tenantId, async () => {
      const staff = await createStaffProfile(staffType, staffData);
      const created = await createUserForStaff(
        staffType,
        {
          id: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          phone: staff.phone,
          employeeId: staff.employeeId,
          status: staff.status,
        },
        tenantId
      );
      return { staff, user: created?.user ?? null };
    });

    return NextResponse.json({
      message: `${staffType.charAt(0).toUpperCase() + staffType.slice(1)} created successfully`,
      staff: { ...result.staff, staffType },
      user: result.user ? { email: result.user.email, name: result.user.name } : null,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating staff:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create staff' }, { status: 500 });
  }
}
