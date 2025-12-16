import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
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
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';
    const search = searchParams.get('search');

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
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
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

    const services = await Service.find(query)
      .sort({ category: 1, name: 1 })
      .limit(200);

    return NextResponse.json({ success: true, data: services });
  } catch (error: any) {
    console.error('Error fetching services:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can add services
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

    // Auto-generate code if not provided (tenant-scoped)
    if (!body.code) {
      const categoryPrefix = body.category?.toUpperCase().substring(0, 4) || 'SERV';
      const codeQuery: any = { code: { $regex: `^${categoryPrefix}` } };
      if (tenantId) {
        codeQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const lastService = await Service.findOne(codeQuery)
        .sort({ code: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastService?.code) {
        const match = lastService.code.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.code = `${categoryPrefix}-${String(nextNumber).padStart(3, '0')}`;
    }

    // Ensure service is created with tenantId
    const serviceData: any = { ...body };
    if (tenantId && !serviceData.tenantId) {
      serviceData.tenantId = new Types.ObjectId(tenantId);
    }

    const service = await Service.create(serviceData);
    return NextResponse.json({ 
      success: true, 
      data: service,
      message: 'Service created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating service:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Service with this code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create service' },
      { status: 500 }
    );
  }
}

