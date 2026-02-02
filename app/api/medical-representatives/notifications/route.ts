import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';

/**
 * PUT /api/medical-representatives/notifications
 * Update notification preferences for medical representative
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

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

    const medicalRep = await MedicalRepresentative.findOne({
      userId: session.userId,
    });

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    // Update notification preferences
    if (typeof body.notificationsEnabled === 'boolean') {
      medicalRep.notificationsEnabled = body.notificationsEnabled;
    }
    if (typeof body.emailNotifications === 'boolean') {
      medicalRep.emailNotifications = body.emailNotifications;
    }

    await medicalRep.save();

    return NextResponse.json({
      success: true,
      message: 'Notification preferences updated',
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Update notifications error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
