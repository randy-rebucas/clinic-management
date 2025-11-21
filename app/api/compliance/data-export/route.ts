import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { createAuditLog, logDataExport } from '@/lib/audit';

/**
 * Export patient data (PH DPA - Right to Data Portability)
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { patientId } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Get patient data
    const patient = await Patient.findById(patientId)
      .populate('visits')
      .populate('appointments')
      .lean();

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get related data
    const Visit = (await import('@/models/Visit')).default;
    const Appointment = (await import('@/models/Appointment')).default;
    const Prescription = (await import('@/models/Prescription')).default;
    const LabResult = (await import('@/models/LabResult')).default;
    const Invoice = (await import('@/models/Invoice')).default;
    const Document = (await import('@/models/Document')).default;

    const [visits, appointments, prescriptions, labResults, invoices, documents] = await Promise.all([
      Visit.find({ patient: patientId }).lean(),
      Appointment.find({ patient: patientId }).lean(),
      Prescription.find({ patient: patientId }).lean(),
      LabResult.find({ patient: patientId }).lean(),
      Invoice.find({ patient: patientId }).lean(),
      Document.find({ patient: patientId, status: 'active' }).lean(),
    ]);

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
      documents: documents.map(doc => ({
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

