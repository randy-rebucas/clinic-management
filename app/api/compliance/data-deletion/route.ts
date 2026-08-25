import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog, logDataDeletion } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById, anonymizePatient, deletePatient } from '@/lib/data/patient';
import { anonymizeVisitsForPatient, deleteVisitsByPatient } from '@/lib/data/visit';
import { deleteAppointmentsByPatient } from '@/lib/data/appointment';
import { deletePrescriptionsByPatient } from '@/lib/data/prescription';
import { deleteLabResultsByPatient } from '@/lib/data/lab-result';
import { deleteInvoicesByPatient } from '@/lib/data/invoice';
import { markDocumentsDeletedByPatient } from '@/lib/data/document';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;

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

    const patient = await run(tenantId ?? null, () => getPatientById(patientId));
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Anonymize or delete related data
    // Option 1: Anonymize (recommended for medical records - keep for legal requirements)
    // Option 2: Delete (for complete removal - use with caution)

    const deletionMode = body.mode || 'anonymize'; // 'anonymize' or 'delete'

    if (deletionMode === 'anonymize') {
      await run(tenantId ?? null, async () => {
        await anonymizePatient(patientId);
        await anonymizeVisitsForPatient(patientId);
      });
    } else {
      // Complete deletion (WARNING: This removes all data)
      await run(tenantId ?? null, () =>
        Promise.all([
          deleteVisitsByPatient(patientId),
          deleteAppointmentsByPatient(patientId),
          deletePrescriptionsByPatient(patientId),
          deleteLabResultsByPatient(patientId),
          deleteInvoicesByPatient(patientId),
          markDocumentsDeletedByPatient(patientId),
        ]).then(() => deletePatient(patientId))
      );
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
      `/api/compliance/data-deletion`,
      tenantId
    );

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
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
