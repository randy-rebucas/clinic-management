import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Referral from '@/models/Referral';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parsePagination, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';
import { clinicNames } from '../_lib/clinic-names';
import {
  PATIENT_REFERRAL_FILTER,
  PATIENT_REFERRAL_SELECT,
  patientReferralPopulates,
  toPatientReferral,
} from './_lib/referral-view';

/**
 * GET /api/patients/me/referrals
 * The authenticated patient's referrals (to a specialist or another clinic), newest first:
 * who to, why, status, dates and the appointment booked from it. Staff notes are never sent.
 * Query params: page (default 1), limit (default 20, max 50), tenantId?
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

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 50 });

    const linked = await linkedRecords(patient as any);
    const tenant = resolveTenantFilter(linked.tenantIds, session, searchParams.get('tenantId'));
    if (!tenant.ok) return tenant.response;

    const query = { patient: { $in: linked.patientIds }, ...tenant.filter, ...PATIENT_REFERRAL_FILTER };

    let find = Referral.find(query).select(PATIENT_REFERRAL_SELECT);
    for (const populate of patientReferralPopulates(linked.patientIds)) find = find.populate(populate);
    const [rows, total] = await Promise.all([
      find.sort({ referredDate: -1, _id: -1 }).skip(skip).limit(limit).lean<Record<string, any>[]>(),
      Referral.countDocuments(query),
    ]);
    const names = await clinicNames(rows.map((r) => r.tenantId));

    return NextResponse.json({
      success: true,
      data: rows.map((r) => toPatientReferral(r, names)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Error fetching patient referrals', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch referrals' }, { status: 500 });
  }
}
