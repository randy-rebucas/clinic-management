import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';

/**
 * PUT /api/medical-representatives/profile
 * Update medical representative profile information
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

    // Find and update medical representative
    const medicalRep = await MedicalRepresentative.findOne({
      userId: session.userId,
    });

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    // Update allowed fields
    if (body.firstName) medicalRep.firstName = body.firstName;
    if (body.lastName) medicalRep.lastName = body.lastName;
    if (body.phone) medicalRep.phone = body.phone;
    if (body.company) medicalRep.company = body.company;
    if (body.specialization) medicalRep.specialization = body.specialization;

    await medicalRep.save();

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
