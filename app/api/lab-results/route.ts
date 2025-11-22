import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read lab-results
  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    let query: any = {};
    if (patientId) {
      query.patient = patientId;
    }
    if (visitId) {
      query.visit = visitId;
    }
    if (status) {
      query.status = status;
    }

    const labResults = await LabResult.find(query)
      .populate('patient', 'firstName lastName patientCode email phone')
      .populate('visit', 'visitCode date')
      .populate('orderedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ orderDate: -1 });

    return NextResponse.json({ success: true, data: labResults });
  } catch (error: any) {
    console.error('Error fetching lab results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch lab results' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create lab-results
  const permissionCheck = await requirePermission(session, 'lab-results', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();

    // Auto-generate request code
    const lastLabResult = await LabResult.findOne({ requestCode: { $exists: true, $ne: null } })
      .sort({ requestCode: -1 })
      .exec();

    let nextNumber = 1;
    if (lastLabResult?.requestCode) {
      const match = lastLabResult.requestCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    body.requestCode = `LAB-${String(nextNumber).padStart(6, '0')}`;

    // Set orderedBy to current user if not specified
    if (!body.orderedBy) {
      body.orderedBy = session.userId;
    }

    // Set orderDate if not provided
    if (!body.orderDate) {
      body.orderDate = new Date();
    }

    const labResult = await LabResult.create(body);
    await labResult.populate('patient', 'firstName lastName patientCode email phone');
    await labResult.populate('visit', 'visitCode date');
    await labResult.populate('orderedBy', 'name email');

    return NextResponse.json({ success: true, data: labResult }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating lab result:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create lab result' },
      { status: 500 }
    );
  }
}

