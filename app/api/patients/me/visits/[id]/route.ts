import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

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
    await connectDB();

    const { id } = await params;

    const patient = await Patient.findById(session.patientId).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const patientTenantIds = (patient as any).tenantIds ?? [];

    // Ensure patient owns this visit
    const visitQuery: any = { _id: id, patient: session.patientId };
    if (patientTenantIds.length > 0) {
      visitQuery.tenantId = { $in: patientTenantIds };
    }

    const visit = await Visit.findOne(visitQuery)
      .populate({ path: 'provider', select: 'firstName lastName email' })
      .lean();

    if (!visit) {
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
