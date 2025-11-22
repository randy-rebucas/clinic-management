import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';

export async function GET(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read patients
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const sex = searchParams.get('sex') || '';
    const active = searchParams.get('active');
    const minAge = searchParams.get('minAge');
    const maxAge = searchParams.get('maxAge');
    const city = searchParams.get('city') || '';
    const state = searchParams.get('state') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = searchParams.get('limit');
    const page = searchParams.get('page') || '1';

    // Build filter query
    const filter: any = {};

    // Search filter - search across multiple fields
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { middleName: searchRegex },
        { email: searchRegex },
        { phone: { $regex: search.replace(/\D/g, ''), $options: 'i' } },
        { patientCode: searchRegex },
        { 'address.city': searchRegex },
        { 'address.state': searchRegex },
      ];
    }

    // Sex filter
    if (sex && sex !== 'all') {
      filter.sex = sex;
    }

    // Active status filter
    if (active !== null && active !== undefined) {
      filter.active = active === 'true';
    }

    // Age range filter
    if (minAge || maxAge) {
      const now = new Date();
      if (maxAge) {
        const minDate = new Date(now.getFullYear() - parseInt(maxAge) - 1, now.getMonth(), now.getDate());
        filter.dateOfBirth = { ...filter.dateOfBirth, $gte: minDate };
      }
      if (minAge) {
        const maxDate = new Date(now.getFullYear() - parseInt(minAge), now.getMonth(), now.getDate());
        filter.dateOfBirth = { ...filter.dateOfBirth, $lte: maxDate };
      }
    }

    // Location filters
    if (city) {
      filter['address.city'] = new RegExp(city, 'i');
    }
    if (state) {
      filter['address.state'] = new RegExp(state, 'i');
    }

    // Build sort object
    const sort: any = {};
    if (sortBy === 'name') {
      sort.lastName = sortOrder === 'asc' ? 1 : -1;
      sort.firstName = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'dateOfBirth') {
      sort.dateOfBirth = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'patientCode') {
      sort.patientCode = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    // Pagination - use settings default if limit not provided
    const settings = await getSettings();
    const defaultLimit = settings.generalSettings?.itemsPerPage || 20;
    const pageNum = parseInt(page);
    const limitNum = limit ? parseInt(limit) : defaultLimit;
    const skip = (pageNum - 1) * limitNum;

    // Build query
    let query = Patient.find(filter).sort(sort).skip(skip).limit(limitNum);

    // Execute query
    const [patients, total] = await Promise.all([
      query.exec(),
      Patient.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: patients,
      pagination: limitNum ? {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      } : undefined,
    });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    const errorMessage = error?.message || 'Failed to fetch patients';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create patients
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();
    
    console.log('Creating patient with data:', JSON.stringify(body, null, 2));
    
    // Auto-generate patientCode if not provided
    if (!body.patientCode) {
      const lastPatient = await Patient.findOne({ patientCode: { $exists: true, $ne: null } })
        .sort({ patientCode: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastPatient?.patientCode) {
        const match = lastPatient.patientCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
    }
    
    const patient = await Patient.create(body);
    return NextResponse.json({ success: true, data: patient }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating patient:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      errors: error.errors,
    });
    
    if (error.name === 'ValidationError') {
      // Extract validation error messages
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { success: false, error: validationErrors || error.message },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Patient with this email already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create patient' },
      { status: 500 }
    );
  }
}

