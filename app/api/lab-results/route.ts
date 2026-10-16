import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createLabResultSchema, nextLabRequestCode } from '@/lib/lab-result-schema';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

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
    if (status) {
      query.status = status;
    }

    const labResults = await LabResult.find(query)
      .select('-thirdPartyLab.apiKey')
      .populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
      .populate('orderedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ orderDate: -1 })
      .limit(limit)
      .lean();

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
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createLabResultSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const patient = await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
        { status: 400 }
      );
    }
    if (body.visit && !(await Visit.exists({ _id: body.visit, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid visit' }, { status: 400 });
    }
    for (const userId of [body.orderedBy, body.reviewedBy]) {
      if (userId && userId !== session.userId && !(await User.exists({ _id: userId, tenantId: tenantObjectId }))) {
        return NextResponse.json({ success: false, error: 'Invalid staff member' }, { status: 400 });
      }
    }

    const labResult = await LabResult.create({
      ...body,
      requestCode: await nextLabRequestCode(tenantId),
      orderedBy: body.orderedBy || session.userId,
      orderDate: body.orderDate || new Date(),
      tenantId: tenantObjectId,
    });

    await labResult.populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } });
    await labResult.populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });
    await labResult.populate('orderedBy', 'name email');

    return NextResponse.json({ success: true, data: labResult }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating lab result:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid lab result data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create lab result' },
      { status: 500 }
    );
  }
}
