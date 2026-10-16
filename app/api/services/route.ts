import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { sanitizeSearch } from '@/lib/utils';
import { SERVICE_CATEGORIES, serviceCreateSchema } from './schema';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const active = searchParams.get('active') !== 'false';
    const search = searchParams.get('search');

    const query: Record<string, unknown> = tenantFilter(ctx.tenantId);

    if (active) {
      query.active = true;
    }
    if (category && (SERVICE_CATEGORIES as readonly string[]).includes(category)) {
      query.category = category;
    }
    if (search) {
      const safeSearch = sanitizeSearch(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { code: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const services = await Service.find(query)
      .sort({ category: 1, name: 1 })
      .limit(200);

    return NextResponse.json({ success: true, data: services });
  } catch (error) {
    console.error('Error fetching services:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch services' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'services', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, serviceCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const body = { ...parsed.data };

  try {
    await connectDB();

    // Auto-generate code if not provided (tenant-scoped)
    if (!body.code) {
      const categoryPrefix = body.category.toUpperCase().substring(0, 4);
      const lastService = await Service.findOne(
        tenantFilter(ctx.tenantId, { code: { $regex: `^${escapeRegex(categoryPrefix)}` } })
      )
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

    const service = await Service.create({ ...body, tenantId: ctx.tenantObjectId });
    return NextResponse.json({
      success: true,
      data: service,
      message: 'Service created successfully'
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating service:', error);
    if (error?.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid service data' },
        { status: 400 }
      );
    }
    if (error?.code === 11000) {
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
