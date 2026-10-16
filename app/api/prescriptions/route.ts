import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { createPrescriptionSchema } from '@/lib/prescription-schema';
import { nextPrescriptionCode } from '@/lib/clinical-codes';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const STATUSES = ['active', 'partially-dispensed', 'dispensed', 'completed', 'cancelled'];

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
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const medication = (searchParams.get('medication') || '').trim().slice(0, 200);
    const mine = searchParams.get('mine') === 'true';
    const pageParam = searchParams.get('page');
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const query: any = { tenantId: tenantObjectId };
    if (mine) query.prescribedBy = new Types.ObjectId(session.userId);
    if (medication) query['medications.name'] = new RegExp(`^${escapeRegex(medication)}$`, 'i');
    if (search) {
      // Prescription code, a medicine name, or the name / code / phone of a patient of this clinic.
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
      query.$or = [{ prescriptionCode: rx }, { 'medications.name': rx }, { patient: { $in: patientIds.map((p) => p._id) } }];
    }
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (visitId) {
      if (!isValidId(visitId)) return NextResponse.json({ success: true, data: [] });
      query.visit = new Types.ObjectId(visitId);
    }
    if (status) {
      // "waiting" = not yet fully dispensed; otherwise one known status.
      if (status === 'waiting') query.status = { $in: ['active', 'partially-dispensed'] };
      else if (STATUSES.includes(status)) query.status = status;
    }

    const find = () =>
      Prescription.find(query)
        .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
        .populate('prescribedBy', 'name email')
        .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
        .sort({ issuedAt: -1, _id: -1 });

    // Paged when `page` is passed (the prescriptions list); otherwise the newest `limit` (other screens).
    if (pageParam) {
      const [prescriptions, total] = await Promise.all([find().skip((page - 1) * limit).limit(limit).lean(), Prescription.countDocuments(query)]);
      return NextResponse.json({ success: true, data: prescriptions, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }

    const prescriptions = await find().limit(limit).lean();
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

    // The signature carries the signed-in user's own name, never a name the browser supplied.
    const signer = body.digitalSignature
      ? ((await User.findOne({ _id: session.userId, tenantId: tenantObjectId }).select('name').lean()) as { name?: string } | null)
      : null;

    const prescription = await Prescription.create({
      ...body,
      prescriptionCode: await nextPrescriptionCode(tenantId),
      prescribedBy: body.prescribedBy || session.userId,
      digitalSignature: body.digitalSignature
        ? { ...body.digitalSignature, providerName: signer?.name || body.digitalSignature.providerName, signedAt: new Date() }
        : undefined,
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
