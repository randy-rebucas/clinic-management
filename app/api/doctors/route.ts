import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createDoctorSchema, duplicateResponse, resolveSpecialization, validationMessage } from './_lib/doctor-input';

export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    // List fields only: internal notes are staff-only (and this list is open to medical
    // representatives), and the stored performance snapshot is stale; figures come from the
    // productivity reports instead.
    const doctors = await Doctor.find(tenantFilter(tenantId))
      .select('-internalNotes -performanceMetrics -availabilityOverrides -professionalFees')
      .populate('specializationId', 'name description category')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: doctors });
  } catch (error: any) {
    console.error('Error fetching doctors:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch doctors' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createDoctorSchema);
    if (isValidationError(parsed)) return parsed;

    const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
    const limitCheck = await checkSubscriptionLimit(tenantId, 'createDoctor');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason || 'Subscription limit exceeded',
          limit: limitCheck.limit,
          current: limitCheck.current,
          remaining: limitCheck.remaining,
        },
        { status: 403 }
      );
    }

    const resolved = await resolveSpecialization(parsed.data);
    if ('error' in resolved) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
    }
    if (!resolved.specializationId) {
      return NextResponse.json(
        { success: false, error: 'Specialization is required' },
        { status: 400 }
      );
    }

    const doctor = await Doctor.create({ ...resolved, tenantId: tenantObjectId });
    await doctor.populate('specializationId', 'name description category');
    return NextResponse.json({ success: true, data: doctor }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: validationMessage(error) },
        { status: 400 }
      );
    }
    if (error.code === 11000) return duplicateResponse(error);
    console.error('Error creating doctor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create doctor' },
      { status: 500 }
    );
  }
}
