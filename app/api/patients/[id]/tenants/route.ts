import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runAsSystem } from '@/lib/tenant-context';
import { listPatientTenants } from '@/lib/data/patient';

/**
 * GET /api/patients/[id]/tenants
 *
 * Lists every tenant (clinic branch) a patient belongs to, via the
 * PatientTenant junction table. This intentionally runs in runAsSystem() —
 * the whole point of the route is to enumerate ALL of a patient's tenant
 * memberships, which a runWithTenant(tenantId, ...)-scoped Patient query
 * could never do (junction scoping would filter it down to just the
 * caller's own tenant). See lib/prisma-tenant-extension.ts
 * JUNCTION_SCOPED_MODELS.Patient and lib/data/patient.ts listPatientTenants().
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Patient ID required' }, { status: 400 });
    }

    const tenants = await runAsSystem(() => listPatientTenants(id));

    return NextResponse.json({ success: true, tenants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch clinics' }, { status: 500 });
  }
}
