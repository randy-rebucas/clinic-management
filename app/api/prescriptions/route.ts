import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createPrescriptionSchema } from '@/lib/prescription-schema';
import { nextPrescriptionCode } from '@/lib/clinical-codes';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const query: any = { tenantId: tenantObjectId };
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (visitId) {
      if (!isValidId(visitId)) return NextResponse.json({ success: true, data: [] });
      query.visit = new Types.ObjectId(visitId);
    }
    if (status && typeof status === 'string') {
      query.status = status;
    }

    const prescriptions = await Prescription.find(query)
      .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
      .populate('prescribedBy', 'name email')
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
      .sort({ issuedAt: -1 })
      .limit(limit)
      .lean();

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
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createPrescriptionSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const patient = await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
        { status: 400 }
      );
    }
    if (body.visit && !(await Visit.exists({ _id: body.visit, tenantId: tenantObjectId, patient: body.patient }))) {
      return NextResponse.json({ success: false, error: 'Invalid visit' }, { status: 400 });
    }
    if (body.prescribedBy && body.prescribedBy !== session.userId
      && !(await User.exists({ _id: body.prescribedBy, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid prescriber' }, { status: 400 });
    }

    const prescription = await Prescription.create({
      ...body,
      prescriptionCode: await nextPrescriptionCode(tenantId),
      prescribedBy: body.prescribedBy || session.userId,
      digitalSignature: body.digitalSignature ? { ...body.digitalSignature, signedAt: new Date() } : undefined,
      drugInteractions: body.drugInteractions?.map((i) => ({ ...i, checkedAt: new Date() })),
      tenantId: tenantObjectId,
    });

    await prescription.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await prescription.populate('prescribedBy', 'name email');

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating prescription:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid prescription data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create prescription' },
      { status: 500 }
    );
  }
}
