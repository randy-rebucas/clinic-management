import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { logDataExport } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { buildVisitWhere, listVisits } from '@/lib/data/visit';
import { buildAppointmentWhere, listAppointments } from '@/lib/data/appointment';
import { buildPrescriptionWhere, listPrescriptions } from '@/lib/data/prescription';
import { buildLabResultWhere, listLabResults } from '@/lib/data/lab-result';
import { buildInvoiceWhere, listInvoices } from '@/lib/data/invoice';
import { buildDocumentWhere, listDocuments } from '@/lib/data/document';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Export patient data (PH DPA - Right to Data Portability)
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;

    const body = await request.json();
    const { patientId } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Get patient data
    const patient = await run(tenantId ?? null, () => getPatientById(patientId));

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get related data
    const [visits, appointments, prescriptions, labResults, invoices, documentsResult] = await run(
      tenantId ?? null,
      () =>
        Promise.all([
          listVisits(buildVisitWhere({ patientId })),
          listAppointments(buildAppointmentWhere({ patientId })),
          listPrescriptions(buildPrescriptionWhere({ patientId })),
          listLabResults(buildLabResultWhere({ patientId })),
          listInvoices(buildInvoiceWhere({ patientId })),
          listDocuments(buildDocumentWhere({ patientId, status: 'active' })),
        ])
    );
    const documents = documentsResult.items;

    // Compile export data
    const exportData = {
      exportDate: new Date().toISOString(),
      patient: {
        ...patient,
        // Remove sensitive fields if needed
      },
      visits,
      appointments,
      prescriptions,
      labResults,
      invoices,
      documents: documents.map((doc: any) => ({
        ...doc,
        url: undefined, // Don't include file URLs in export
      })),
    };

    // Log data export
    await logDataExport(
      session.userId,
      session.email,
      session.role,
      'patient',
      patientId,
      request.headers.get('x-forwarded-for') || undefined,
      {
        exportType: 'data_portability',
        recordCount: {
          visits: visits.length,
          appointments: appointments.length,
          prescriptions: prescriptions.length,
          labResults: labResults.length,
          invoices: invoices.length,
          documents: documents.length,
        },
      }
    );

    return NextResponse.json({
      success: true,
      data: exportData,
      message: 'Patient data exported (PH DPA compliance)',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="patient-data-${patientId}-${new Date().toISOString()}.json"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting patient data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to export patient data' },
      { status: 500 }
    );
  }
}
