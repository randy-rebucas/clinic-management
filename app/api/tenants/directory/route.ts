import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

/**
 * GET /api/tenants/directory
 *
 * Paginated, searchable list of active clinics intended for third-party
 * app integration (clinic-selection screen). Only returns publicly safe
 * fields — no subscription details, no internal IDs beyond what is
 * required for the validation call.
 *
 * Query parameters:
 *  search  – partial match on name, displayName, or subdomain (case-insensitive)
 *  city    – filter by address.city (case-insensitive)
 *  page    – page number, default 1
 *  limit   – results per page, default 20, max 50
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.api);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search')?.trim() ?? '';
    const city = searchParams.get('city')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const skip = (page - 1) * limit;

    const query: Record<string, any> = { status: 'active' };

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: regex },
        { displayName: regex },
        { subdomain: regex },
      ];
    }

    if (city) {
      query['address.city'] = new RegExp(
        city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
    }

    const [tenants, total] = await Promise.all([
      Tenant.find(query)
        .select('name displayName subdomain address settings.logo')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Tenant.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: tenants.map((t: any) => ({
        id: String(t._id),
        name: t.name,
        displayName: t.displayName || t.name,
        subdomain: t.subdomain,
        city: t.address?.city ?? null,
        state: t.address?.state ?? null,
        country: t.address?.country ?? null,
        logo: t.settings?.logo ?? null,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching tenant directory:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch clinic directory' },
      { status: 500 }
    );
  }
}
