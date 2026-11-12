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
import { z } from 'zod';
import {
  createLabResultSchema,
  createLabOrderSchema,
  nextLabRequestCode,
  orderRequestCodes,
  type CreateLabOrder,
} from '@/lib/lab-result-schema';

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
      query.$or = [{ requestCode: rx }, { orderCode: rx }, { 'request.testType': rx }, { patient: { $in: patientIds.map((p) => p._id) } }];
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

    // The lab results list, one row per order: the tests placed together, with the filters matched test by test.
    if (pageParam && searchParams.get('group') === 'order') {
      const [facet] = await LabResult.aggregate([
        { $match: query },
        // Only what a row shows, so grouping never carries whole documents (results, files…).
        {
          $project: {
            orderCode: 1, patient: 1, visit: 1, orderedBy: 1, orderDate: 1, requestCode: 1, status: 1,
            abnormalFlags: 1, resultDate: 1, reviewedAt: 1, notificationSent: 1,
            'request.testType': 1, 'request.urgency': 1,
          },
        },
        {
          // Tests of one order share patient, doctor, visit and urgency, so any test's value will do.
          $group: {
            _id: { $ifNull: ['$orderCode', { $toString: '$_id' }] },
            orderCode: { $first: '$orderCode' },
            patient: { $first: '$patient' },
            visit: { $first: '$visit' },
            orderedBy: { $first: '$orderedBy' },
            orderDate: { $max: '$orderDate' },
            urgency: { $first: '$request.urgency' },
            lastId: { $max: '$_id' },
            tests: {
              $push: {
                _id: '$_id',
                requestCode: '$requestCode',
                testType: '$request.testType',
                urgency: '$request.urgency',
                status: '$status',
                abnormalFlags: '$abnormalFlags',
                resultDate: '$resultDate',
                reviewedAt: '$reviewedAt',
                notificationSent: '$notificationSent',
              },
            },
          },
        },
        { $sort: { orderDate: -1, lastId: -1 } },
        {
          $facet: {
            rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            total: [{ $count: 'n' }],
          },
        },
      ]);
      const rows: any[] = facet?.rows ?? [];
      // Tests in the order they were placed (LAB-000123-1, -2…).
      for (const r of rows) r.tests.sort((a: any, b: any) => String(a.requestCode ?? '').localeCompare(String(b.requestCode ?? ''), undefined, { numeric: true }));
      await LabResult.populate(rows, [
        { path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } },
        { path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } },
        { path: 'orderedBy', select: 'name email' },
      ]);
      const total = facet?.total?.[0]?.n ?? 0;
      return NextResponse.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }

    // Paged (the lab results list) returns list fields only; otherwise the newest `limit` in full (other screens).
    if (pageParam) {
      const [labResults, total] = await Promise.all([
        find('requestCode orderCode patient visit orderedBy reviewedBy orderDate request.testType request.urgency status resultDate reviewedAt abnormalFlags notificationSent')
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
    // `tests: [...]` places one order holding several tests; otherwise a single test (older clients).
    const sniff = await request.clone().json().catch(() => null);
    const isOrder = Boolean(sniff && typeof sniff === 'object' && Array.isArray((sniff as { tests?: unknown }).tests));
    const parsed: { data: CreateLabOrder | z.infer<typeof createLabResultSchema> } | NextResponse = isOrder
      ? await parseBody(request, createLabOrderSchema)
      : await parseBody(request, createLabResultSchema);
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
    for (const userId of [body.orderedBy, 'reviewedBy' in body ? body.reviewedBy : undefined]) {
      if (userId && userId !== session.userId && !(await User.exists({ _id: userId, tenantId: tenantObjectId }))) {
        return NextResponse.json({ success: false, error: 'Invalid staff member' }, { status: 400 });
      }
    }

    const orderCode = await nextLabRequestCode(tenantId);
    const shared = {
      orderCode,
      orderedBy: body.orderedBy || session.userId,
      orderDate: body.orderDate || new Date(),
      tenantId: tenantObjectId,
    };
    let docs: Record<string, unknown>[];
    if ('tests' in body) {
      const { tests, request: common, ...rest } = body;
      const codes = orderRequestCodes(orderCode, tests.length);
      docs = tests.map((t, i) => ({ ...rest, ...shared, requestCode: codes[i], request: { ...common, ...t } }));
    } else {
      docs = [{ ...body, ...shared, requestCode: orderCode }];
    }
    // Ids chosen here, so a failed save can remove exactly what this request wrote.
    for (const d of docs) d._id = new Types.ObjectId();

    // The whole order is saved, or none of it: Mongoose validates every test before inserting,
    // and a write error part-way removes the tests this request already wrote (by their ids only).
    let created: any[];
    try {
      created = await LabResult.insertMany(docs, { ordered: true });
    } catch (error) {
      if (docs.length > 1) {
        await LabResult.deleteMany({ tenantId: tenantObjectId, _id: { $in: docs.map((d) => d._id) } }).catch(() => {});
      }
      throw error;
    }
    const ids = created.map((d) => d._id);
    if (body.visit) {
      await Visit.updateOne({ _id: body.visit, tenantId: tenantObjectId }, { $addToSet: { labsOrdered: { $each: ids } } });
    }

    const populate = (q: any) =>
      q
        .populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } })
        .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
        .populate('orderedBy', 'name email');
    const saved = await populate(LabResult.find({ _id: { $in: ids }, tenantId: tenantObjectId }).select('-thirdPartyLab.apiKey')).lean();
    // Keep the order the tests were entered in.
    const byId = new Map(saved.map((d: any) => [String(d._id), d]));
    const data = ids.map((id) => byId.get(String(id))).filter(Boolean);

    const open = created.filter((d) => d.status === 'ordered');
    if (open.length) {
      const order = {
        orderCode,
        urgency: open[0].request?.urgency,
        tests: open.map((d) => ({ _id: d._id as Types.ObjectId, testType: d.request?.testType })),
      };
      after(async () => {
        try {
          const { notifyLabStaffOfRequest } = await import('@/lib/automations/lab-notifications');
          await notifyLabStaffOfRequest(order, tenantObjectId);
        } catch (error) {
          console.error('Error notifying lab staff of a new request:', error);
        }
      });
    }

    if ('tests' in body) {
      return NextResponse.json({ success: true, orderCode, data }, { status: 201 });
    }
    return NextResponse.json({ success: true, data: data[0] }, { status: 201 });
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
