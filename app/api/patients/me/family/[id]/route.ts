import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import logger from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { PATIENT_PROFILE_HEADER, patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { personRecordIds, removeDependent } from '@/lib/patient-family';
import { findAccountForSession, forgetAccountCache } from '@/lib/emcr/account';

/**
 * DELETE /api/patients/me/family/[id]
 * Stop managing this family member (their record id from GET /api/patients/me/family). Removes
 * the signed-in person as guardian on every record of that family member, whoever added the link,
 * and drops the person from the eMCR account's own `dependents` (both kinds are listed by GET).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 'ignore', not 'refuse': a guardian-only eMCR session (no record of its own) may drop the
  // account's own dependents too. Acting through the family-profile header is still refused.
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);
  const profile = request.headers.get(PATIENT_PROFILE_HEADER)?.trim();
  if (profile && profile !== session.patientId) {
    return NextResponse.json(
      { success: false, code: 'NOT_FOR_FAMILY_PROFILE', error: 'Switch back to your own profile to do this.' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Family member not found.' }, { status: 404 });
    }
    // A guardian session is signed in on a managed record, not as a guardian on Patient.guardians.
    const viaRecord = session.rel === 'guardian' ? false : await removeDependent(await personRecordIds(session.patientId), id);
    const viaAccount = await removeAccountDependent(session, id);
    if (!viaRecord && !viaAccount) {
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

/** Pull the person behind `dependentId` (any of their records) from the session's account `dependents`. */
async function removeAccountDependent(
  session: NonNullable<Awaited<ReturnType<typeof verifyPatientAuth>>>,
  dependentId: string
): Promise<boolean> {
  const account = await findAccountForSession(session);
  if (!account?.dependents?.length) return false;
  const ids = [...new Set([dependentId, ...(await personRecordIds(dependentId)).map(String)])].map((v) => new Types.ObjectId(v));
  await connectDB();
  const result = await EmcrAccount.updateOne({ _id: account._id }, { $pull: { dependents: { patientId: { $in: ids } } } });
  if (result.modifiedCount > 0) forgetAccountCache();
  return result.modifiedCount > 0;
}
