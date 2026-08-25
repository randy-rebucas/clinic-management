import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listVisits } from '@/lib/data/visit';
import { listPrescriptions } from '@/lib/data/prescription';
import { logDataExport } from '@/lib/audit';
import {
  buildFHIRPatient,
  buildFHIREncounter,
  buildFHIRObservations,
  buildFHIRMedicationRequests,
  buildFHIRBundle,
} from '@/lib/fhir';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * GET /api/patients/[id]/export?format=fhir|json
 *
 * Exports a patient's complete health record.
 * - format=fhir  → FHIR R4 Bundle (default)
 * - format=json  → Raw JSON (legacy, same as compliance export)
 *
 * Requires staff authentication + patients:read permission.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;

  const format = request.nextUrl.searchParams.get('format') ?? 'fhir';

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const patient = await runAsSystem(() => getPatientById(id));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const [visits, prescriptions] = await run(tenantId, () =>
      Promise.all([
        listVisits({ patientId: id }),
        listPrescriptions({ patientId: id }),
      ])
    );

    // Audit log
    await logDataExport(
      session.userId,
      session.email,
      session.role,
      'patient',
      id,
      request.headers.get('x-forwarded-for') ?? undefined,
      {
        exportType: format === 'fhir' ? 'fhir_r4' : 'json',
        recordCount: { visits: visits.length, prescriptions: prescriptions.length },
      }
    );

    if (format === 'json') {
      return NextResponse.json(
        { exportDate: new Date().toISOString(), patient, visits, prescriptions },
        {
          headers: {
            'Content-Disposition': `attachment; filename="patient-${id}.json"`,
          },
        }
      );
    }

    // Build FHIR R4 Bundle
    const resources: any[] = [buildFHIRPatient(patient)];

    for (const visit of visits) {
      resources.push(buildFHIREncounter(visit));
      resources.push(...buildFHIRObservations(visit));
    }

    for (const rx of prescriptions) {
      resources.push(...buildFHIRMedicationRequests(rx));
    }

    const bundle = buildFHIRBundle(resources);

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/fhir+json',
        'Content-Disposition': `attachment; filename="patient-${id}-fhir-r4.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Error exporting patient data:', error);
    return NextResponse.json({ success: false, error: 'Failed to export patient data' }, { status: 500 });
  }
}
