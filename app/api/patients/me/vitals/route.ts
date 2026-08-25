import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listVisits } from '@/lib/data/visit';
import type { Prisma } from '@prisma/client';

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
    const patient = await runAsSystem(() => getPatientById(session.patientId));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds: string[] = (patient as any).tenantIds ?? [];

    const where: Prisma.VisitWhereInput = { patientId: session.patientId };
    if (tenantIdParam) {
      where.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      where.tenantId = { in: patientTenantIds };
    }

    const allVisits = await runAsSystem(() => listVisits(where));
    const visits = allVisits.slice(0, limit);

    const vitalsHistory = visits
      .filter((v: any) => v.vitals && Object.values(v.vitals as object).some((val) => val != null))
      .map((v: any) => ({
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
