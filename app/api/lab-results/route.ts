import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (patientId) {
      query.patient = patientId;
    }
    if (visitId) {
      query.visit = visitId;
    }
    if (status) {
      query.status = status;
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

    const labResults = await LabResult.find(query)
      .populate(patientPopulateOptions)
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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Validate that the patient belongs to the tenant
    // Patient model uses tenantIds (array) since patients can belong to multiple clinics
    if (body.patient && tenantId) {
      const patientQuery: any = {
        _id: body.patient,
        tenantIds: new Types.ObjectId(tenantId),
      };
      const patient = await Patient.findOne(patientQuery);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }

    // Auto-generate request code (tenant-scoped)
    const codeQuery: any = { requestCode: { $exists: true, $ne: null } };
    if (tenantId) {
      codeQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const lastLabResult = await LabResult.findOne(codeQuery)
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

    // Ensure lab result is created with tenantId
    const labResultData: any = { ...body };
    if (tenantId && !labResultData.tenantId) {
      labResultData.tenantId = new Types.ObjectId(tenantId);
    }

    const labResult = await LabResult.create(labResultData);
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    await labResult.populate(patientPopulateOptions);
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

