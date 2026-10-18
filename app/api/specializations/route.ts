import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Specialization from '@/models/Specialization';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText, escapeRegex } from '@/lib/api/validate';
import { sanitizeSearch } from '@/lib/utils';

const specializationCreateSchema = z.object({
  name: zShortText.min(1),
  description: z.string().trim().max(2000).optional(),
  category: zShortText.optional(),
  active: z.boolean().optional(),
});

/**
 * GET /api/specializations
 *
 * Fetch all active medical specializations.
 * Specializations are global and shared across all tenants.
 *
 * Query Parameters:
 * - category: Filter by category (optional)
 * - search: Search by name (optional)
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // Specializations are global (not tenant-scoped)
    const query: Record<string, unknown> = { active: true };

    if (category) {
      query.category = category.slice(0, 200);
    }

    if (search) {
      query.name = { $regex: sanitizeSearch(search), $options: 'i' };
    }

    const specializations = await Specialization.find(query)
      .select('_id name description category active')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: specializations,
      count: specializations.length
    });
  } catch (error) {
    console.error('Error fetching specializations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch specializations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/specializations
 *
 * Create a new specialization. Requires admin privileges.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Only admins can create specializations');
  }

  const parsed = await parseBody(request, specializationCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const { name, description, category, active = true } = parsed.data;

  try {
    await connectDB();

    // Global, case-insensitive duplicate check
    const existing = await Specialization.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    }).select('_id').lean();
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Specialization already exists' },
        { status: 400 }
      );
    }

    const specialization = await Specialization.create({ name, description, category, active });

    return NextResponse.json(
      { success: true, data: specialization },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating specialization:', error);
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Specialization already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create specialization' },
      { status: 500 }
    );
  }
}
