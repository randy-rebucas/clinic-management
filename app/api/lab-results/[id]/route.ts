import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone dateOfBirth',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const labResult = await LabResult.findOne(query)
      .populate(patientPopulateOptions)
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

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Get old lab result to check status change
    const oldLabResult = await LabResult.findOne(query);
    const statusChangedToCompleted = oldLabResult && oldLabResult.status !== 'completed' && body.status === 'completed';

    const labResult = await LabResult.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    });
    
    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await labResult.populate(patientPopulateOptions);
    await labResult.populate('visit', 'visitCode date');
    await labResult.populate('orderedBy', 'name email');
    await labResult.populate('reviewedBy', 'name email');

    // Check if status changed to 'completed' - trigger automatic notification
    if (statusChangedToCompleted && !labResult.notificationSent) {
      // Import and trigger automatic notification (async, don't wait)
      import('@/lib/automations/lab-notifications').then(({ sendLabResultNotification }) => {
        sendLabResultNotification({
          labResultId: labResult._id,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        }).catch((error) => {
          console.error('Error sending automatic lab result notification:', error);
          // Don't fail the lab result update if notification fails
        });
      }).catch((error) => {
        console.error('Error loading lab notifications module:', error);
      });
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

