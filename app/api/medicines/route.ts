import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';

    let query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (active) {
      query.active = true;
    }
    if (category) {
      query.category = category;
    }
    if (search) {
      const searchConditions = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
        { brandNames: { $in: [new RegExp(search, 'i')] } },
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

    const medicines = await Medicine.find(query)
      .sort({ name: 1 })
      .limit(100);

    return NextResponse.json({ success: true, data: medicines });
  } catch (error: any) {
    console.error('Error fetching medicines:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicines' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can add medicines
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Ensure medicine is created with tenantId
    const medicineData: any = { ...body };
    if (tenantId && !medicineData.tenantId) {
      medicineData.tenantId = new Types.ObjectId(tenantId);
    }
    
    const medicine = await Medicine.create(medicineData);
    return NextResponse.json({ success: true, data: medicine }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating medicine:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create medicine' },
      { status: 500 }
    );
  }
}

