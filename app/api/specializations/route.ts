import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runAsSystem } from '@/lib/tenant-context';
import { sanitizeSearch } from '@/lib/utils';
import { listSpecializations, getSpecializationByName, createSpecialization } from '@/lib/data/specialization';

/**
 * GET /api/specializations
 *
 * Fetch all active medical specializations.
 * Specializations are global and shared across all tenants — not
 * tenant-scoped in prisma/schema.prisma (no tenantId column), so this
 * legitimately runs cross-tenant via runAsSystem().
 *
 * Query Parameters:
 * - category: Filter by category (optional)
 * - search: Search by name (optional)
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    const specializations = await runAsSystem(() =>
      listSpecializations({
        category: category || undefined,
        search: search ? sanitizeSearch(search) : undefined,
      })
    );

    return NextResponse.json({
      success: true,
      data: specializations,
      count: specializations.length
    });
  } catch (error: any) {
    console.error('Error fetching specializations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch specializations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/specializations
 *
 * Create a new specialization.
 * Requires admin privileges.
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Only admins can create specializations' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { name, description, category, active = true } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Specialization name is required' },
        { status: 400 }
      );
    }

    const specialization = await runAsSystem(async () => {
      // Check if specialization already exists (global check)
      const existing = await getSpecializationByName(name.trim());
      if (existing) {
        return null;
      }

      return createSpecialization({
        name: name.trim(),
        description: description?.trim(),
        category: category?.trim(),
        active,
      });
    });

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, data: specialization },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create specialization' },
      { status: 500 }
    );
  }
}
