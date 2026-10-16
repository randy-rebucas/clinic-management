import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Specialization from '@/models/Specialization';
import { forbiddenResponse } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';

/**
 * GET /api/specializations/[id]
 *
 * Fetch a single specialization by ID. Specializations are global, so no tenant filter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const { id } = await params;
  if (!isValidId(id)) {
    return NextResponse.json(
      { success: false, error: 'Invalid specialization ID' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const specialization = await Specialization.findById(id).lean();

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: specialization });
  } catch (error) {
    console.error('Error fetching specialization:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch specialization' },
      { status: 500 }
    );
  }
}

// Specializations are shared by every clinic and there is no platform-level admin role,
// so a single clinic's admin must not be able to rename or delete them for everyone.
const sharedRecordResponse = () =>
  forbiddenResponse('Specializations are shared across clinics and cannot be modified or deleted');

/**
 * PUT /api/specializations/[id]
 */
export async function PUT() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  return sharedRecordResponse();
}

/**
 * DELETE /api/specializations/[id]
 */
export async function DELETE() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  return sharedRecordResponse();
}
