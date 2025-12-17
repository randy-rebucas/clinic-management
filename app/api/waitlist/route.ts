import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { addToWaitlist, removeFromWaitlist } from '@/lib/automations/waitlist-management';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Add patient to waitlist
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to manage appointments
  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!body.patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID is required' },
        { status: 400 }
      );
    }

    const result = await addToWaitlist(body.patientId, {
      tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
      doctorId: body.doctorId,
      preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined,
      preferredTime: body.preferredTime,
      priority: body.priority,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to manage appointments
  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID is required' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const result = await removeFromWaitlist(patientId, tenantId ? new Types.ObjectId(tenantId) : undefined);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
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

