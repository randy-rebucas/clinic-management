import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read lab results
  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const labResult = await LabResult.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth')
      .populate('visit', 'visitCode date visitType')
      .populate('orderedBy', 'name email')
      .populate('reviewedBy', 'name email');

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error fetching lab result:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch lab result' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to update lab results
  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    // If results are being updated, set resultDate and update status
    if (body.results && !body.resultDate) {
      body.resultDate = new Date();
    }

    // If status is being set to completed or reviewed, update accordingly
    if (body.status === 'completed' && !body.resultDate) {
      body.resultDate = new Date();
    }

    if (body.status === 'reviewed') {
      body.reviewedBy = session.userId;
      body.reviewedAt = new Date();
    }

    const labResult = await LabResult.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('visit', 'visitCode date')
      .populate('orderedBy', 'name email')
      .populate('reviewedBy', 'name email');

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error updating lab result:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update lab result' },
      { status: 500 }
    );
  }
}

