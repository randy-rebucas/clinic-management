import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { getVisitById } from '@/lib/data/visit';

/**
 * GET /api/patients/me/visits/[id]
 * Returns a single visit detail for the authenticated patient
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    const patient = await runAsSystem(() => getPatientById(session.patientId));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const patientTenantIds: string[] = (patient as any).tenantIds ?? [];

    const visit = await runAsSystem(() => getVisitById(id));

    // Ensure patient owns this visit (and, if tenant-scoped, that it belongs
    // to one of the patient's clinics)
    if (
      !visit ||
      (visit as any).patientId !== session.patientId ||
      (patientTenantIds.length > 0 && !patientTenantIds.includes((visit as any).tenantId))
    ) {
      return NextResponse.json(
        { success: false, error: 'Visit not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    logger.error('Error fetching patient visit detail', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visit' },
      { status: 500 }
    );
  }
}
