import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { isAdmin } from '@/app/lib/auth-helpers';
import { logDataExport } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  patientTenantFilter,
  tenantFilter,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

const exportSchema = z.object({
  patientId: zObjectId,
});

/**
 * Export patient data (PH DPA - Right to Data Portability)
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  if (!isAdmin(session) && session.role !== 'doctor') {
    return NextResponse.json(
      { success: false, error: 'Forbidden - Admin or doctor access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, exportSchema);
    if (isValidationError(parsed)) return parsed;
    const { patientId } = parsed.data;

    const patient = await Patient.findOne(patientTenantFilter(tenantId, { _id: patientId })).lean() as any;

    if (!patient) {
      return notFound('Patient');
    }
    // Do not reveal which other clinics this patient is registered with.
    delete patient.tenantIds;

    const Visit = (await import('@/models/Visit')).default;
    const Appointment = (await import('@/models/Appointment')).default;
    const Prescription = (await import('@/models/Prescription')).default;
    const LabResult = (await import('@/models/LabResult')).default;
    const Invoice = (await import('@/models/Invoice')).default;
    const Document = (await import('@/models/Document')).default;

    const scoped = (extra: Record<string, unknown> = {}) => tenantFilter(tenantId, { patient: patientId, ...extra });

    const [visits, appointments, prescriptions, labResults, invoices, documents] = await Promise.all([
      Visit.find(scoped()).lean(),
      Appointment.find(scoped()).lean(),
      Prescription.find(scoped()).lean(),
      LabResult.find(scoped()).lean(),
      Invoice.find(scoped()).lean(),
      Document.find(scoped({ status: 'active' })).lean(),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      patient,
      visits,
      appointments,
      prescriptions,
      labResults,
      invoices,
      documents: documents.map(doc => ({
        ...doc,
        url: undefined, // Don't include file URLs in export
      })),
    };

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
      },
      tenantId
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
