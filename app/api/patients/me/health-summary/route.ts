import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { buildHealthSummary } from '@/lib/patient-health-summary';
import { scopedTenantIds } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';

/**
 * GET /api/patients/me/health-summary
 * The patient's health record across every clinic they're registered at (narrowed to the
 * session's clinic when it carries one): allergies, conditions, current and recent medicines,
 * vaccinations, each tagged with the clinic that recorded it. See lib/patient-health-summary.ts.
 * POST ./pdf-link returns a link to the same summary as a PDF.
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
    const summary = await buildHealthSummary({
      patientId: session.patientId,
      patientIds: linked.patientIds,
      scope: scopedTenantIds(linked.tenantIds, session),
    });
    if (!summary) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logger.error('Error building patient health summary', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load your health summary' }, { status: 500 });
  }
}
