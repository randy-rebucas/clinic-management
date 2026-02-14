import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Nurse, Receptionist, Accountant, User } from '@/models';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// GET /api/staff - Get all staff members (nurses, receptionists, accountants)
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'nurse', 'receptionist', 'accountant', or 'all'
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build query filters with tenant filter
    const buildQuery = (baseQuery: any) => {
      // Add tenant filter
      if (tenantId) {
        baseQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        baseQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      if (status) baseQuery.status = status;
      if (search) {
        const searchConditions = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } },
        ];
        
        // Combine tenant filter with search conditions
        const tenantFilter: any = {};
        if (tenantId) {
          tenantFilter.tenantId = new Types.ObjectId(tenantId);
        } else {
          tenantFilter.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
        }
        
        baseQuery.$and = [
          tenantFilter,
          { $or: searchConditions }
        ];
      }
      return baseQuery;
    };

    const results: any = { nurses: [], receptionists: [], accountants: [] };
    let totalCount = 0;

    // Fetch based on type filter
    if (!type || type === 'all' || type === 'nurse') {
      const nurseQuery = buildQuery({});
      const [nurses, nurseCount] = await Promise.all([
        Nurse.find(nurseQuery).sort({ createdAt: -1 }).skip(type === 'nurse' ? skip : 0).limit(type === 'nurse' ? limit : 100).lean(),
        Nurse.countDocuments(nurseQuery),
      ]);
      results.nurses = nurses.map((n: any) => ({ ...n, staffType: 'nurse' }));
      if (type === 'nurse') totalCount = nurseCount;
    }

    if (!type || type === 'all' || type === 'receptionist') {
      const receptionistQuery = buildQuery({});
      const [receptionists, receptionistCount] = await Promise.all([
        Receptionist.find(receptionistQuery).sort({ createdAt: -1 }).skip(type === 'receptionist' ? skip : 0).limit(type === 'receptionist' ? limit : 100).lean(),
        Receptionist.countDocuments(receptionistQuery),
      ]);
      results.receptionists = receptionists.map((r: any) => ({ ...r, staffType: 'receptionist' }));
      if (type === 'receptionist') totalCount = receptionistCount;
    }

    if (!type || type === 'all' || type === 'accountant') {
      const accountantQuery = buildQuery({});
      const [accountants, accountantCount] = await Promise.all([
        Accountant.find(accountantQuery).sort({ createdAt: -1 }).skip(type === 'accountant' ? skip : 0).limit(type === 'accountant' ? limit : 100).lean(),
        Accountant.countDocuments(accountantQuery),
      ]);
      results.accountants = accountants.map((a: any) => ({ ...a, staffType: 'accountant' }));
      if (type === 'accountant') totalCount = accountantCount;
    }

    // If type is 'all', combine and sort all staff
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

    // Return specific type
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

    await connectDB();
    
    // Get tenant context from session or headers
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

    // Ensure staff is created with tenantId
    if (tenantId && !staffData.tenantId) {
      staffData.tenantId = new Types.ObjectId(tenantId);
    }

    let staff;
    switch (staffType) {
      case 'nurse':
        staff = await Nurse.create(staffData);
        break;
      case 'receptionist':
        staff = await Receptionist.create(staffData);
        break;
      case 'accountant':
        staff = await Accountant.create(staffData);
        break;
    }

    // The post-save hook will automatically create a User account
    // Wait a bit for the hook to complete and fetch the created user
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const profileField = `${staffType}Profile`;
    const user = await User.findOne({ [profileField]: staff._id }).lean();

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
    return NextResponse.json({ error: error.message || 'Failed to create staff' }, { status: 500 });
  }
}
