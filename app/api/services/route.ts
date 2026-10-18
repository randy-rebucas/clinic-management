import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { sanitizeSearch } from '@/lib/utils';
import { codePrefix, nextCode } from '@/lib/services';
import { SERVICE_CATEGORIES, serviceCreateSchema } from './schema';

/**
 * GET: the price list. `active=false` lists services taken off the list, `active=all` lists
 * both; anything else lists what is on it. (`active=false` used to drop the filter instead, so
 * "Inactive" showed everything and inactive services could never be listed on their own.)
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const active = searchParams.get('active');
    const search = searchParams.get('search');

    const query: Record<string, unknown> = tenantFilter(ctx.tenantId);

    if (active === 'false') query.active = false;
    else if (active !== 'all') query.active = true;
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
  const body: Record<string, unknown> = { ...parsed.data };
  for (const key of ['description', 'type', 'notes', 'unit'] as const) {
    if (body[key] === '') delete body[key];
  }
  const chosenCode = Boolean(parsed.data.code);

  try {
    await connectDB();

    // A made-up code takes the next number after every code with its prefix, on or off the
    // list; a clash with a code saved at the same moment is retried with the following one.
    for (let attempt = 0; ; attempt++) {
      if (!chosenCode) {
        const prefix = codePrefix(parsed.data.category);
        const taken = await Service.find(tenantFilter(ctx.tenantId, { code: { $regex: `^${escapeRegex(prefix)}`, $options: 'i' } }))
          .select('code')
          .lean<{ code: string }[]>();
        const code = nextCode(taken.map((t) => t.code), parsed.data.category);
        body.code = attempt === 0 ? code : code.replace(/\d+$/, (n) => String(parseInt(n, 10) + attempt).padStart(3, '0'));
      }
      try {
        const service = await Service.create({ ...body, tenantId: ctx.tenantObjectId });
        await createAuditLog({
          userId: ctx.session.userId,
          userEmail: ctx.session.email,
          userRole: ctx.session.role,
          tenantId: ctx.tenantId,
          action: 'create',
          resource: 'service',
          resourceId: String(service._id),
          description: `Added ${service.name} (${service.code}) to the price list at ${service.unitPrice}`,
          metadata: { category: service.category, unitPrice: service.unitPrice },
        });
        return NextResponse.json({
          success: true,
          data: service,
          message: 'Service created successfully'
        }, { status: 201 });
      } catch (error: any) {
        if (error?.code === 11000 && !chosenCode && attempt < 3) continue;
        throw error;
      }
    }
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
        { success: false, error: `Another service already has the code ${String(body.code)}. Choose a different code, or leave it blank to get one.` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create service' },
      { status: 500 }
    );
  }
}
