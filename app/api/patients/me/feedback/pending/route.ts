import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Survey from '@/models/Survey';
import Tenant from '@/models/Tenant';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { FEEDBACK_WINDOW_MS, feedbackProviderName } from '@/lib/visit-feedback';
import { tenantScopeFilter } from '../../_lib/patient-scope';
import { linkedRecords } from '../../_lib/linked-records';

/** At most this many visits are offered at once (the app shows the newest). */
const MAX_PENDING = 5;

/**
 * GET /api/patients/me/feedback/pending
 * The patient's recent visits (last 30 days) their clinic asked for feedback on and that have
 * none yet, newest first, for the app's "How was your visit?" prompt. Only what the prompt
 * needs: never the SMS/email link token.
 * → 200 [{ visitId, visitDate, visitType, providerName, clinicName, tenantId }]
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).select('active email tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const linked = await linkedRecords(patient as any);
    const visits = await Visit.find({
      patient: { $in: linked.patientIds },
      ...tenantScopeFilter(linked.tenantIds, session),
      feedbackRequested: true,
      date: { $gte: new Date(Date.now() - FEEDBACK_WINDOW_MS) },
    })
      .select('_id date visitType provider tenantId')
      // `provider` refs User, which stores `name`.
      .populate({ path: 'provider', select: 'name' })
      .sort({ date: -1 })
      .limit(20)
      .lean<any[]>();
    if (!visits.length) return NextResponse.json({ success: true, data: [] });

    const answered = await Survey.find({ visitId: { $in: visits.map((v) => v._id) } })
      .select('visitId')
      .lean<{ visitId: unknown }[]>();
    const done = new Set(answered.map((s) => String(s.visitId)));
    const pending = visits.filter((v) => !done.has(String(v._id))).slice(0, MAX_PENDING);
    if (!pending.length) return NextResponse.json({ success: true, data: [] });

    const tenantIds = [...new Set(pending.map((v) => String(v.tenantId)).filter((id) => Types.ObjectId.isValid(id)))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } })
      .select('name displayName')
      .lean<{ _id: unknown; name?: string; displayName?: string }[]>();
    const clinicName = new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || null]));

    const data = pending.map((v) => ({
      visitId: String(v._id),
      visitDate: v.date,
      visitType: v.visitType ?? null,
      providerName: feedbackProviderName(v.provider),
      clinicName: clinicName.get(String(v.tenantId)) ?? null,
      tenantId: v.tenantId ? String(v.tenantId) : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching pending visit feedback', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch pending feedback' }, { status: 500 });
  }
}
