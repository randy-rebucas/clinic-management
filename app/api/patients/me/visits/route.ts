import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listVisits } from '@/lib/data/visit';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/patients/me/visits
 * Returns a paginated list of the authenticated patient's visits
 * Query params: page (default 1), limit (default 10, max 50), tenantId?
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
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
    const skip = (page - 1) * limit;

    // Allow multi-clinic patients to filter by a specific tenant
    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds: string[] = (patient as any).tenantIds ?? [];

    const where: Prisma.VisitWhereInput = { patientId: session.patientId };
    if (tenantIdParam) {
      where.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      where.tenantId = { in: patientTenantIds };
    }

    const allVisits = await runAsSystem(() => listVisits(where));
    const total = allVisits.length;
    const visits = allVisits.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      data: visits,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient visits', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}
