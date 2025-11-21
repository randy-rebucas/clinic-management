import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog, logDataDeletion } from '@/lib/audit';

/**
 * Delete patient data (PH DPA - Right to be Forgotten)
 * WARNING: This is a destructive operation
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can delete patient data
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json();
    const { patientId, reason, confirm } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    if (confirm !== 'DELETE') {
      return NextResponse.json(
        { success: false, error: 'Confirmation required. Send confirm: "DELETE" to proceed.' },
        { status: 400 }
      );
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get related models
    const Visit = (await import('@/models/Visit')).default;
    const Appointment = (await import('@/models/Appointment')).default;
    const Prescription = (await import('@/models/Prescription')).default;
    const LabResult = (await import('@/models/LabResult')).default;
    const Invoice = (await import('@/models/Invoice')).default;
    const Document = (await import('@/models/Document')).default;

    // Anonymize or delete related data
    // Option 1: Anonymize (recommended for medical records - keep for legal requirements)
    // Option 2: Delete (for complete removal - use with caution)

    const deletionMode = body.mode || 'anonymize'; // 'anonymize' or 'delete'

    if (deletionMode === 'anonymize') {
      // Anonymize patient data
      await Patient.findByIdAndUpdate(patientId, {
        firstName: '[ANONYMIZED]',
        lastName: '[ANONYMIZED]',
        email: `anonymized-${patientId}@deleted.local`,
        phone: '[ANONYMIZED]',
        address: {
          street: '[ANONYMIZED]',
          city: '[ANONYMIZED]',
          province: '[ANONYMIZED]',
          zipCode: '[ANONYMIZED]',
        },
        dateOfBirth: null,
        identifiers: {},
        emergencyContact: {},
        notes: '[Data anonymized per PH DPA request]',
      });

      // Anonymize related records
      await Visit.updateMany({ patient: patientId }, {
        $set: { notes: '[Data anonymized]' },
      });
    } else {
      // Complete deletion (WARNING: This removes all data)
      await Promise.all([
        Visit.deleteMany({ patient: patientId }),
        Appointment.deleteMany({ patient: patientId }),
        Prescription.deleteMany({ patient: patientId }),
        LabResult.deleteMany({ patient: patientId }),
        Invoice.deleteMany({ patient: patientId }),
        Document.updateMany({ patient: patientId }, { status: 'deleted' }),
        Patient.findByIdAndDelete(patientId),
      ]);
    }

    // Log data deletion
    await logDataDeletion(
      session.userId,
      session.email,
      session.role,
      'patient',
      patientId,
      patientId,
      request.headers.get('x-forwarded-for') || undefined,
      `/api/compliance/data-deletion`
    );

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'data_deletion',
      resource: 'patient',
      resourceId: patientId,
      dataSubject: patientId,
      description: `Patient data ${deletionMode === 'anonymize' ? 'anonymized' : 'deleted'} per PH DPA request`,
      metadata: {
        mode: deletionMode,
        reason: reason || 'PH DPA - Right to be Forgotten',
      },
      isSensitive: true,
    });

    return NextResponse.json({
      success: true,
      message: `Patient data ${deletionMode === 'anonymize' ? 'anonymized' : 'deleted'} successfully`,
      mode: deletionMode,
    });
  } catch (error: any) {
    console.error('Error deleting patient data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete patient data' },
      { status: 500 }
    );
  }
}

