import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { createReferralSchema, normalizeReferral, referralPopulate, validateReferralRefs } from '@/lib/referral-helpers';
import { directionFilter, OPEN_STATUSES, REFERRAL_STATUSES, URGENCIES, waitRange } from '@/lib/referrals';
import { myDoctorProfileId } from '@/lib/doctor-access';
import { nextSequence, formatCode } from '@/lib/counters';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const LIST_FIELDS =
  'referralCode type patient referringDoctor referringPatient referringClinic referringContact.name receivingDoctor receivingClinic reason urgency specialty status referredDate acceptedDate completedDate declinedDate followUpRequired followUpDate';

/**
 * GET /api/referrals
 * Paged (`page`) for the referrals list, with `search`, `mine` (referrals the signed-in doctor sent
 * or receives), `toMe` (waiting for the signed-in doctor's answer), `direction`, `status` (or
 * `open`), `urgency` (or `high` = urgent or STAT), `waiting` (days-waiting bucket), and `to` (a
 * destination key from the insights).
 * Without `page`: the newest `limit` referrals, filtered by patient/doctor/status/type as before.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const sp = request.nextUrl.searchParams;
    const pageParam = sp.get('page');
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const empty = () =>
      NextResponse.json({ success: true, data: [], ...(pageParam ? { pagination: { page, limit, total: 0, pages: 1 } } : {}) });

    const and: Record<string, unknown>[] = [{ tenantId: tenantObjectId }];
    for (const [key, value] of [['referringDoctor', sp.get('referringDoctor')], ['receivingDoctor', sp.get('receivingDoctor')], ['patient', sp.get('patientId')]] as const) {
      if (!value) continue;
      if (!isValidId(value)) return empty();
      and.push({ [key]: new Types.ObjectId(value) });
    }

    const mine = sp.get('mine') === 'true';
    const toMe = sp.get('toMe') === 'true';
    if (mine || toMe) {
      const me = await myDoctorProfileId(tenantId, session.userId);
      if (!me) return empty();
      const meId = new Types.ObjectId(me);
      and.push(toMe ? { receivingDoctor: meId, status: 'pending' } : { $or: [{ referringDoctor: meId }, { receivingDoctor: meId }] });
    }

    const status = sp.get('status');
    if (status === 'open') and.push({ status: { $in: OPEN_STATUSES } });
    else if (status && (REFERRAL_STATUSES as readonly string[]).includes(status)) and.push({ status });

    const type = sp.get('type');
    if (type && ['doctor_to_doctor', 'patient_to_patient', 'external'].includes(type)) and.push({ type });

    const direction = sp.get('direction');
    const dir = direction ? directionFilter(direction) : null;
    if (dir) and.push(dir);

    const urgency = sp.get('urgency');
    if (urgency === 'high') and.push({ urgency: { $in: ['urgent', 'stat'] } });
    else if (urgency && (URGENCIES as readonly string[]).includes(urgency)) and.push({ urgency });

    const waiting = sp.get('waiting');
    const range = waiting ? waitRange(waiting) : null;
    if (range) and.push({ status: 'pending', referredDate: range });

    const to = (sp.get('to') || '').slice(0, 220);
    if (to.startsWith('d:')) {
      if (!isValidId(to.slice(2))) return empty();
      and.push({ receivingDoctor: new Types.ObjectId(to.slice(2)) });
    } else if (to.startsWith('c:') && to.length > 2) {
      and.push({ receivingDoctor: null, receivingClinic: new RegExp(`^\\s*${escapeRegex(to.slice(2).trim())}\\s*$`, 'i') });
    }

    const search = (sp.get('search') || '').trim().slice(0, 100);
    if (search) {
      // Code, reason, specialty, the outside clinic or contact, or a patient / doctor of this clinic by name.
      const rx = new RegExp(escapeRegex(search), 'i');
      const words = search.split(/\s+/).filter(Boolean).map((w) => new RegExp(escapeRegex(w), 'i'));
      const nameMatch = words.length > 1 ? { $and: words.map((w) => ({ $or: [{ firstName: w }, { lastName: w }] })) } : { $or: [{ firstName: rx }, { lastName: rx }] };
      const [patients, doctors] = await Promise.all([
        Patient.find({ tenantIds: tenantObjectId, $or: [{ patientCode: rx }, { phone: rx }, nameMatch] }).select('_id').limit(500).lean(),
        Doctor.find({ tenantId: tenantObjectId, ...nameMatch }).select('_id').limit(100).lean(),
      ]);
      const patientIds = patients.map((p) => p._id);
      const doctorIds = doctors.map((d) => d._id);
      and.push({
        $or: [
          { referralCode: rx },
          { reason: rx },
          { specialty: rx },
          { receivingClinic: rx },
          { referringClinic: rx },
          { 'referringContact.name': rx },
          { patient: { $in: patientIds } },
          { referringPatient: { $in: patientIds } },
          { referringDoctor: { $in: doctorIds } },
          { receivingDoctor: { $in: doctorIds } },
        ],
      });
    }

    const query = and.length === 1 ? and[0] : { $and: and };
    const find = (select?: string) => {
      const q = Referral.find(query);
      if (select) q.select(select);
      return q
        .populate(referralPopulate(tenantObjectId))
        .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
        .populate({ path: 'appointment', select: 'appointmentCode appointmentDate', match: { tenantId: tenantObjectId } })
        .sort({ referredDate: -1, _id: -1 });
    };

    if (pageParam) {
      const [referrals, total] = await Promise.all([find(LIST_FIELDS).skip((page - 1) * limit).limit(limit).lean(), Referral.countDocuments(query)]);
      return NextResponse.json({ success: true, data: referrals, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
    }

    const referrals = await find('-feedback.submittedBy').limit(limit).lean();
    return NextResponse.json({ success: true, data: referrals });
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/referrals
 * Every new referral starts as waiting for a reply. A referral sent by "us" without a named
 * sender is signed with the signed-in doctor's profile.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'referrals', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createReferralSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    if ((body.direction === 'internal' || body.direction === 'out') && !body.referringDoctor) {
      body.referringDoctor = (await myDoctorProfileId(tenantId, session.userId)) ?? undefined;
    }

    const { set, problems } = normalizeReferral(body, body.patient);
    if (problems.length) {
      return NextResponse.json({ success: false, error: 'Validation failed', issues: problems }, { status: 400 });
    }

    const refError = await validateReferralRefs({ ...set, patient: body.patient }, tenantObjectId, body.patient);
    if (refError) {
      return NextResponse.json({ success: false, error: refError }, { status: 400 });
    }

    const seq = await nextSequence(tenantObjectId, 'referral', () => Referral.countDocuments({ tenantId: tenantObjectId }));

    const referral = await Referral.create({
      ...set,
      patient: body.patient,
      status: 'pending',
      referralCode: formatCode('REF', seq),
      referredDate: new Date(),
      tenantId: tenantObjectId,
    });

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'create',
      resource: 'referral',
      resourceId: referral._id,
      dataSubject: body.patient,
      description: `Created referral ${referral.referralCode} (${body.direction})`,
    });

    return NextResponse.json({ success: true, data: { _id: String(referral._id), referralCode: referral.referralCode } }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid referral data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create referral' },
      { status: 500 }
    );
  }
}
