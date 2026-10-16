import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';

/**
 * PUT /api/medical-representatives/notifications
 * Update notification preferences for medical representative
 */
export async function PUT(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    await connectDB();

    const repFilter: Record<string, unknown> = { userId: rep.userObjectId };
    if (rep.ownerFilter.tenantId) repFilter.tenantIds = rep.ownerFilter.tenantId;
    const medicalRep = await MedicalRepresentative.findOne(repFilter);

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    if (typeof body?.notificationsEnabled === 'boolean') {
      medicalRep.notificationsEnabled = body.notificationsEnabled;
    }
    if (typeof body?.emailNotifications === 'boolean') {
      medicalRep.emailNotifications = body.emailNotifications;
    }

    await medicalRep.save();

    const result = medicalRep.toObject();
    delete result.internalNotes;
    delete result.paymentStatus;
    delete result.paymentDate;
    delete result.paymentAmount;
    delete result.paymentMethod;
    delete result.paymentReference;
    delete result.password;

    return NextResponse.json({
      success: true,
      message: 'Notification preferences updated',
      data: result,
    });
  } catch (error: any) {
    console.error('Update notifications error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
