import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { runAsSystem } from '@/lib/tenant-context';
import { listTenantDirectory } from '@/lib/data/tenant';

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
 *
 * Cross-tenant public directory — wrapped in runAsSystem() per the tenant
 * branch policy.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.api);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search')?.trim() ?? '';
    const city = searchParams.get('city')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const skip = (page - 1) * limit;

    const [tenants, total] = await runAsSystem(() =>
      listTenantDirectory({ search, city, skip, take: limit })
    );

    return NextResponse.json({
      success: true,
      data: tenants.map((t) => ({
        id: t.id,
        name: t.name,
        displayName: t.displayName || t.name,
        subdomain: t.subdomain,
        city: t.addressCity ?? null,
        state: t.addressState ?? null,
        country: t.addressCountry ?? null,
        logo: t.settingsLogo ?? null,
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
