import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { addToWaitlist, removeFromWaitlist } from '@/lib/automations/waitlist-management';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';

/**
 * Add patient to waitlist
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));

    if (!isValidId(body?.patientId)) {
      return NextResponse.json(
        { success: false, error: 'Patient ID is required' },
        { status: 400 }
      );
    }
    if (!(await Patient.exists({ _id: body.patientId, tenantIds: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }
    if (body.doctorId && (!isValidId(body.doctorId) || !(await Doctor.exists({ _id: body.doctorId, tenantId: tenantObjectId })))) {
      return NextResponse.json({ success: false, error: 'Doctor not found' }, { status: 404 });
    }
    const preferredDate = body.preferredDate ? new Date(body.preferredDate) : undefined;
    if (preferredDate && isNaN(preferredDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid preferred date' }, { status: 400 });
    }

    const result = await addToWaitlist(body.patientId, {
      tenantId: tenantObjectId,
      doctorId: body.doctorId || undefined,
      preferredDate,
      preferredTime: typeof body.preferredTime === 'string' ? body.preferredTime.slice(0, 10) : undefined,
      priority: typeof body.priority === 'number' || typeof body.priority === 'string' ? body.priority : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to add to waitlist' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Patient added to waitlist',
      data: result,
    });
  } catch (error: any) {
    console.error('Error adding to waitlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add to waitlist' },
      { status: 500 }
    );
  }
}

/**
 * Remove patient from waitlist
 */
export async function DELETE(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const patientId = request.nextUrl.searchParams.get('patientId');

    if (!isValidId(patientId)) {
      return NextResponse.json(
        { success: false, error: 'Patient ID is required' },
        { status: 400 }
      );
    }

    const result = await removeFromWaitlist(patientId, tenantObjectId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to remove from waitlist' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Patient removed from waitlist',
      data: result,
    });
  } catch (error: any) {
    console.error('Error removing from waitlist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove from waitlist' },
      { status: 500 }
    );
  }
}
