import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listVisits } from '@/lib/data/visit';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * GET /api/patients/[id]/vitals
 * Returns vitals history for a patient across all visits, newest first.
 * Query params: limit (default 20, max 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10))
    );

    const patient = await runAsSystem(() => getPatientById(id));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const where: Prisma.VisitWhereInput = { patientId: id };

    const visits = await run(tenantId, () => listVisits(where, limit));

    // Only return visits that actually have at least one vital recorded
    const vitalsHistory = visits
      .filter((v: any) => v.vitals && Object.values(v.vitals as object).some((val) => val != null))
      .map((v: any) => ({
        visitId: v._id,
        visitCode: v.visitCode,
        visitType: v.visitType,
        date: v.date,
        vitals: v.vitals,
      }))
      .reverse(); // chronological order for charts

    return NextResponse.json({ success: true, data: vitalsHistory });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch vitals history' },
      { status: 500 }
    );
  }
}
