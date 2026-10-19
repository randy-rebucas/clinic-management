import { NextRequest, NextResponse } from 'next/server';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { personRecordIds, removeDependent } from '@/lib/patient-family';

/**
 * DELETE /api/patients/me/family/[id]
 * Stop managing this family member (their record id from GET /api/patients/me/family). Removes
 * the signed-in person as guardian on every record of that family member, whoever added the link.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  try {
    const { id } = await params;
    const removed = await removeDependent(await personRecordIds(session.patientId), id);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'Family member not found.' }, { status: 404 });
    }

    const dependent = await Patient.findById(id).select('tenantIds').lean<{ tenantIds?: unknown[] } | null>();
    await createAuditLog({
      userId: session.patientId,
      userEmail: session.email,
      userRole: 'patient',
      tenantId: dependent?.tenantIds?.[0] as string | undefined,
      action: 'update',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      description: 'Patient removed a family member from their family account',
      metadata: { guardianPatientId: session.patientId },
    });

    return NextResponse.json({ success: true, message: 'Removed from your family.' });
  } catch (error) {
    logger.error('Error removing family member', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to remove family member' }, { status: 500 });
  }
}
