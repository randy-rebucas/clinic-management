import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { logDataExport } from '@/lib/audit';
import {
  buildFHIRPatient,
  buildFHIREncounter,
  buildFHIRObservations,
  buildFHIRMedicationRequests,
  buildFHIRBundle,
} from '@/lib/fhir';
import { Types } from 'mongoose';

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
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, error: 'Invalid patient ID' }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'fhir';

  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const patient = await Patient.findById(id).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const patientQuery: any = { patient: new Types.ObjectId(id) };
    if (tenantId) patientQuery.tenantId = new Types.ObjectId(tenantId);

    const [visits, prescriptions] = await Promise.all([
      Visit.find(patientQuery).lean(),
      Prescription.find(patientQuery).lean(),
    ]);

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
