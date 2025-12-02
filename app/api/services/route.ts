import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { withTenantFilter } from '@/app/lib/api-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';
    const search = searchParams.get('search');

    // Build query with tenant filtering
    let query: any = await withTenantFilter({});
    
    if (active) {
      query.active = true;
    }
    if (category) {
      query.category = category;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
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

    // Add tenantId to the service data
    const tenantFilter = await withTenantFilter({});
    body.tenantId = tenantFilter.tenantId;
    
    // Auto-generate code if not provided (tenant-scoped)
    if (!body.code) {
      const categoryPrefix = body.category?.toUpperCase().substring(0, 4) || 'SERV';
      const lastService = await Service.findOne({ 
        ...tenantFilter,
        code: { $regex: `^${categoryPrefix}` } 
      })
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

    const service = await Service.create(body);
    return NextResponse.json({ success: true, data: service }, { status: 201 });
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

