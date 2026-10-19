import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { createHealthSummaryLinkToken } from '@/lib/health-summary-link';
import { requestOrigin } from '@/lib/signed-link';

/**
 * POST /api/patients/me/health-summary/pdf-link
 * A 10-minute link to the health summary as a PDF, for the app to open in the browser or share.
 * The PDF covers the same clinics this session sees.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    await connectDB();
    const patient = await Patient.findById(session.patientId).select('active email tenantIds').lean();
    if (!patient) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const { token, expiresAt } = createHealthSummaryLinkToken(session.patientId, session.tid);
    return NextResponse.json({
      success: true,
      data: { url: `${requestOrigin(request)}/api/health-summary/${token}`, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    logger.error('Error creating health summary PDF link', error as Error);
    return NextResponse.json({ success: false, error: 'Could not prepare the PDF. Try again.' }, { status: 500 });
  }
}
