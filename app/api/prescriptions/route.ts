import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
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

  // Check permission to read prescriptions
  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
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

    let query: any = {};
    
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
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const prescriptions = await Prescription.find(query)
      .populate(patientPopulateOptions)
      .populate('prescribedBy', 'name email')
      .populate('visit', 'visitCode date')
      .sort({ issuedAt: -1 });

    return NextResponse.json({ success: true, data: prescriptions });
  } catch (error: any) {
    console.error('Error fetching prescriptions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch prescriptions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create prescriptions
  const permissionCheck = await requirePermission(session, 'prescriptions', 'write');
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
    if (body.patient && tenantId) {
      const patientQuery: any = {
        _id: body.patient,
        tenantId: new Types.ObjectId(tenantId),
      };
      const patient = await Patient.findOne(patientQuery);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }

    // Auto-generate prescription code (tenant-scoped)
    const codeQuery: any = { prescriptionCode: { $exists: true, $ne: null } };
    if (tenantId) {
      codeQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const lastPrescription = await Prescription.findOne(codeQuery)
      .sort({ prescriptionCode: -1 })
      .exec();

    let nextNumber = 1;
    if (lastPrescription?.prescriptionCode) {
      const match = lastPrescription.prescriptionCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    body.prescriptionCode = `RX-${String(nextNumber).padStart(6, '0')}`;

    // Set prescribedBy to current user if not specified
    if (!body.prescribedBy) {
      body.prescribedBy = session.userId;
    }

    // Handle digital signature
    if (body.digitalSignature) {
      const clientIp = request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown';
      body.digitalSignature = {
        ...body.digitalSignature,
        signedAt: new Date(),
      };
    }

    // Handle drug interactions (save if provided)
    if (body.drugInteractions && Array.isArray(body.drugInteractions)) {
      // Ensure checkedAt is a Date object
      body.drugInteractions = body.drugInteractions.map((interaction: any) => ({
        ...interaction,
        checkedAt: interaction.checkedAt ? new Date(interaction.checkedAt) : new Date(),
      }));
    }

    // Sanitize ObjectId fields - convert empty strings to undefined
    if (body.visit === '' || body.visit === null) {
      body.visit = undefined;
    }
    if (body.prescribedBy === '' || body.prescribedBy === null) {
      body.prescribedBy = undefined;
    }

    // Ensure prescription is created with tenantId
    const prescriptionData: any = { ...body };
    if (tenantId && !prescriptionData.tenantId) {
      prescriptionData.tenantId = new Types.ObjectId(tenantId);
    }

    const prescription = await Prescription.create(prescriptionData);
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await prescription.populate(patientPopulateOptions);
    await prescription.populate('prescribedBy', 'name email');

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating prescription:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create prescription' },
      { status: 500 }
    );
  }
}

