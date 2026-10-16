import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { createVisitSchema, signatureWithMetadata } from '@/lib/visit-schema';
import { nextVisitCode } from '@/lib/clinical-codes';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, combineDateAndTimeInTz } from '@/lib/tz';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const VISIT_TYPES = ['consultation', 'follow-up', 'checkup', 'emergency', 'teleconsult', 'vaccination'];

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const providerId = searchParams.get('providerId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const visitType = searchParams.get('visitType');
    const diagnosis = (searchParams.get('diagnosis') || '').trim().slice(0, 20);
    const mine = searchParams.get('mine') === 'true';
    const pageParam = searchParams.get('page');
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const query: any = { tenantId: tenantObjectId };
    if (mine) query.provider = new Types.ObjectId(session.userId);
    if (visitType && VISIT_TYPES.includes(visitType)) query.visitType = visitType;
    if (diagnosis) query['diagnoses.code'] = diagnosis;
    if (search) {
      // Visit code, or the name / code / phone of a patient of this clinic.
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
      query.$or = [{ visitCode: rx }, { patient: { $in: patientIds.map((p) => p._id) } }];
    }

    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (providerId) {
      if (!isValidId(providerId)) return NextResponse.json({ success: true, data: [] });
      query.provider = new Types.ObjectId(providerId);
    }
    if (status && ['draft', 'open', 'closed', 'cancelled'].includes(status)) {
      query.status = status;
    }
    if (date) {
      const tz = await getTenantTimezone(tenantId);
      const { start, end } = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? dayRangeInTz(combineDateAndTimeInTz(date, '12:00', tz), tz)
        : dayRangeInTz(date, tz);
      query.date = { $gte: start, $lte: end };
    }

    const find = () =>
      Visit.find(query)
        .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
        .populate('provider', 'name email')
        .sort({ date: -1, _id: -1 });

    // Paged when `page` is passed (the visits list); otherwise the newest `limit` (other screens).
    if (pageParam) {
      const [visits, total] = await Promise.all([find().skip((page - 1) * limit).limit(limit).lean(), Visit.countDocuments(query)]);
      return NextResponse.json({ success: true, data: visits, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }

    const visits = await find().limit(limit).lean();
    return NextResponse.json({ success: true, data: visits });
  } catch (error: any) {
    console.error('Error fetching visits:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'visits', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createVisitSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
    const limitCheck = await checkSubscriptionLimit(tenantId, 'createVisit');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason || 'Subscription limit exceeded',
          limit: limitCheck.limit,
          current: limitCheck.current,
          remaining: limitCheck.remaining,
        },
        { status: 403 }
      );
    }

    const patient = await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId });
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
        { status: 400 }
      );
    }

    if (body.provider && body.provider !== session.userId) {
      const provider = await User.exists({ _id: body.provider, tenantId: tenantObjectId });
      if (!provider) {
        return NextResponse.json({ success: false, error: 'Invalid provider' }, { status: 400 });
      }
    }

    const visit = await Visit.create({
      ...body,
      digitalSignature: signatureWithMetadata(body.digitalSignature, session.userId, request),
      provider: body.provider || session.userId,
      visitCode: await nextVisitCode(tenantObjectId),
      tenantId: tenantObjectId,
    });

    await visit.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await visit.populate('provider', 'name email');

    // Auto-create prescription if medications are present in treatment plan. A draft is not a
    // finished note: its prescription (and the patient's email) waits until it is saved as open.
    let prescriptionId: string | undefined;
    if (visit.status !== 'draft' && body.treatmentPlan?.medications && body.treatmentPlan.medications.length > 0) {
      try {
        const { createPrescriptionFromVisit } = await import('@/lib/automations/prescription-from-visit');
        const prescription = await createPrescriptionFromVisit({
          visitId: visit._id,
          tenantId: tenantObjectId,
          createdBy: session.userId,
          shouldSendNotification: true,
        });
        if (prescription && (prescription as any)._id) {
          prescriptionId = (prescription as any)._id.toString();
        }
      } catch (error) {
        console.error('Error auto-creating prescription from visit:', error);
      }
    }

    return NextResponse.json({ success: true, data: visit, prescriptionId }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating visit:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid visit data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create visit' },
      { status: 500 }
    );
  }
}
