import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { checkDrugInteractionsAdvanced, checkInteractionsWithPatientMedications, getApiStats } from '@/lib/drug-interactions';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listActivePrescriptionsForPatient } from '@/lib/data/prescription';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { medications, patientId, includePatientMedications } = body;

    if (!medications || !Array.isArray(medications)) {
      return NextResponse.json({ success: false, error: 'Medications array is required' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    let interactions;
    if (includePatientMedications && patientId) {
      const patient = await runAsSystem(() => getPatientById(patientId));
      const belongsToTenant = tenantId ? patient?.tenantIds?.some((tid: string) => tid === tenantId) : Boolean(patient);
      if (!patient || !belongsToTenant) {
        return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
      }

      const activePrescriptions = await run(tenantId, () => listActivePrescriptionsForPatient(patientId));

      const currentMedications = activePrescriptions.flatMap((prescription) =>
        prescription.medications.map((med) => ({
          name: med.name,
          genericName: med.genericName ?? undefined,
        }))
      );

      interactions = await checkInteractionsWithPatientMedications(medications, currentMedications);
    } else {
      interactions = await checkDrugInteractionsAdvanced(medications);
    }

    const apiStats = getApiStats();

    return NextResponse.json({
      success: true,
      data: {
        interactions,
        hasInteractions: interactions.length > 0,
        severityCounts: {
          contraindicated: interactions.filter((i) => i.severity === 'contraindicated').length,
          severe: interactions.filter((i) => i.severity === 'severe').length,
          moderate: interactions.filter((i) => i.severity === 'moderate').length,
          mild: interactions.filter((i) => i.severity === 'mild').length,
        },
      },
    });
  } catch (error: any) {
    console.error('Error checking drug interactions:', error);
    return NextResponse.json({ success: false, error: 'Failed to check drug interactions' }, { status: 500 });
  }
}
