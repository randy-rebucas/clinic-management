import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parsePagination, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';
import { requireActiveEmcr } from '@/lib/emcr/activation';

/**
 * GET /api/patients/me/vitals
 * Returns vitals history for the authenticated patient, in chronological order.
 * Query params: limit (default 20, max 100), tenantId?
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'records');
  if (locked) return locked;

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
    const { limit } = parsePagination(searchParams, { defaultLimit: 20, maxLimit: 100 });
    // This person's records at every clinic (one per clinic when linked by phone).
    const linked = await linkedRecords(patient as any);
    const tenant = resolveTenantFilter(linked.tenantIds, session, searchParams.get('tenantId'));
    if (!tenant.ok) return tenant.response;

    const query: any = {
      patient: { $in: linked.patientIds },
      vitals: { $exists: true },
      ...tenant.filter,
    };

    const visits = await Visit.find(query)
      .select('date vitals visitType visitCode')
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    const vitalsHistory = visits
      .filter((v) => v.vitals && Object.values(v.vitals as object).some((val) => val != null))
      .map((v) => ({
        visitId: v._id,
        visitCode: v.visitCode,
        visitType: v.visitType,
        date: v.date,
        vitals: v.vitals,
      }))
      .reverse();

    return NextResponse.json({ success: true, data: vitalsHistory });
  } catch (error: any) {
    logger.error('Error fetching patient vitals history', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch vitals history' },
      { status: 500 }
    );
  }
}
