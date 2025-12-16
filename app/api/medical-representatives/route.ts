import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MedicalRepresentative, User } from '@/models';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// GET /api/medical-representatives - Get all medical representatives
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const company = searchParams.get('company');
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
    if (company) query.company = { $regex: company, $options: 'i' };
    if (search) {
      const searchConditions = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
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

    const [representatives, total] = await Promise.all([
      MedicalRepresentative.find(query)
        .populate('userId', 'name email status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      MedicalRepresentative.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: representatives,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching medical representatives:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch medical representatives' }, { status: 500 });
  }
}

// POST /api/medical-representatives - Create a new medical representative
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create medical representatives
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      territory,
      products,
      notes,
    } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json({ success: false, error: 'First name, last name, and email are required' }, { status: 400 });
    }

    // Check if medical representative already exists with this email
    const existingRep = await MedicalRepresentative.findOne({ email: email.toLowerCase().trim() });
    if (existingRep) {
      return NextResponse.json({ success: false, error: 'Medical representative with this email already exists' }, { status: 400 });
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Generate rep code (tenant-scoped)
    const countQuery: any = {};
    if (tenantId) {
      countQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      countQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    const count = await MedicalRepresentative.countDocuments(countQuery);
    const repCode = `MR-${String(count + 1).padStart(4, '0')}`;

    // Create medical representative
    // The post-save hook will automatically create the User account
    // Convert company object to string (use name field)
    const companyString = typeof company === 'object' && company !== null 
      ? (company.name || '') 
      : (company || '');
    
    // Convert territory array to string (join with comma)
    const territoryString = Array.isArray(territory) 
      ? territory.join(', ') 
      : (territory || '');
    
    const repData: any = {
      repCode,
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone,
      company: companyString,
      territory: territoryString,
      products: products || [],
      notes,
      status: 'active',
    };
    
    // Ensure medical representative is created with tenantId
    if (tenantId && !repData.tenantId) {
      repData.tenantId = new Types.ObjectId(tenantId);
    }
    
    const representative = await MedicalRepresentative.create(repData);

    // Populate userId to return the full data
    await representative.populate('userId', 'name email status');

    return NextResponse.json({
      success: true,
      data: representative,
      message: 'Medical representative created successfully',
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medical representative:', error);
    if (error.code === 11000) {
      return NextResponse.json({ success: false, error: 'Medical representative with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: error.message || 'Failed to create medical representative' }, { status: 500 });
  }
}

