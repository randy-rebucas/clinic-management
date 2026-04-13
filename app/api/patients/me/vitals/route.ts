import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

/**
 * GET /api/patients/me/vitals
 * Returns vitals history for the authenticated patient, in chronological order.
 * Query params: limit (default 20, max 100), tenantId?
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds = (patient as any).tenantIds ?? [];

    const query: any = {
      patient: session.patientId,
      vitals: { $exists: true },
    };
    if (tenantIdParam) {
      query.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      query.tenantId = { $in: patientTenantIds };
    }

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
