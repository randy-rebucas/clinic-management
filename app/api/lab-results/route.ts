import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { HAS_ABNORMAL_EXPR, LAB_STATUSES, OUTSTANDING, waitRange } from '@/lib/lab-results';
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
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const testType = (searchParams.get('testType') || '').trim().slice(0, 200);
    const urgency = searchParams.get('urgency');
    const waiting = searchParams.get('waiting');
    const abnormal = searchParams.get('abnormal') === 'true';
    const mine = searchParams.get('mine') === 'true';
    const pageParam = searchParams.get('page');
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const query: any = { tenantId: tenantObjectId };
    if (mine) query.orderedBy = new Types.ObjectId(session.userId);
    if (testType) query['request.testType'] = new RegExp(`^${escapeRegex(testType)}$`, 'i');
    if (urgency && ['routine', 'urgent', 'stat'].includes(urgency)) query['request.urgency'] = urgency;
    if (abnormal) query.$expr = HAS_ABNORMAL_EXPR;
    if (waiting) {
      const range = waitRange(waiting);
      if (range) {
        query.orderDate = range;
        query.status = { $in: OUTSTANDING };
      }
    }
    if (search) {
      // Request code, test name, or the name / code / phone of a patient of this clinic.
      const rx = new RegExp(escapeRegex(search), 'i');
      const words = search.split(/\s+/).filter(Boolean).map((w) => new RegExp(escapeRegex(w), 'i'));
      const patientIds = await Patient.find({
        tenantIds: tenantObjectId,
        $or: [
          { patientCode: rx },
          { phone: rx },
          words.length > 1 ? { $and: words.map((w) => ({ $or: [{ firstName: w }, { lastName: w }] })) } : { $or: [{ firstName: rx }, { lastName: rx }] },
        ],
      })
        .select('_id')
        .limit(500)
        .lean();
      query.$or = [{ requestCode: rx }, { 'request.testType': rx }, { patient: { $in: patientIds.map((p) => p._id) } }];
    }
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (visitId) {
      if (!isValidId(visitId)) return NextResponse.json({ success: true, data: [] });
      query.visit = new Types.ObjectId(visitId);
    }
    if (status && !query.status && (LAB_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }

    const find = (select: string) =>
      LabResult.find(query)
        .select(select)
        .populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } })
        .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
        .populate('orderedBy', 'name email')
        .populate('reviewedBy', 'name email')
        .sort({ orderDate: -1, _id: -1 });

    // Paged (the lab results list) returns list fields only; otherwise the newest `limit` in full (other screens).
    if (pageParam) {
      const [labResults, total] = await Promise.all([
        find('requestCode patient visit orderedBy reviewedBy orderDate request.testType request.urgency status resultDate reviewedAt abnormalFlags notificationSent')
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        LabResult.countDocuments(query),
      ]);
      return NextResponse.json({ success: true, data: labResults, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }

    const labResults = await find('-thirdPartyLab.apiKey').limit(limit).lean();
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

    if (labResult.status === 'ordered') {
      const request = { _id: labResult._id, requestCode: labResult.requestCode, request: labResult.request };
      after(async () => {
        try {
          const { notifyLabStaffOfRequest } = await import('@/lib/automations/lab-notifications');
          await notifyLabStaffOfRequest(request, tenantObjectId);
        } catch (error) {
          console.error('Error notifying lab staff of a new request:', error);
        }
      });
    }

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
