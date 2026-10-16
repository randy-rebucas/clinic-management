import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { deleteSession } from '@/app/lib/dal';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';

/**
 * GET /api/medical-representatives/session
 * Get current medical representative session data
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    await connectDB();

    const filter: Record<string, unknown> = { userId: rep.userObjectId };
    if (rep.ownerFilter.tenantId) filter.tenantIds = rep.ownerFilter.tenantId;

    const medicalRep = await MedicalRepresentative.findOne(filter)
      .select('-internalNotes -paymentStatus -paymentDate -paymentAmount -paymentMethod -paymentReference -password')
      .lean();

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Get medical representative session error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/session
 * Logout medical representative (delete session)
 */
export async function DELETE(request: NextRequest) {
  try {
    // deleteSession expires the cookie with its original domain, so a cross-subdomain cookie is removed too.
    await deleteSession();

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
