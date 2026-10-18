import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import logger from '@/lib/logger';
import { issuePatientLoginQr, LOGIN_QR_TTL_MINUTES, revokeAllPatientAccess } from '../../auth/shared';

/**
 * POST /api/patients/[id]/login-qr
 *
 * Staff-only. Issues a sign-in QR for the patient's eMCR app, revoking any previous
 * unused one. Returns { qrData, expiresAt }; render `qrData` as the QR image content.
 * The QR works once and expires after LOGIN_QR_TTL_MINUTES (15). The session it starts is
 * scoped to the issuing clinic (`tid`): it only sees this clinic's records, even if the
 * patient is also registered elsewhere. The staff UI only shows it on demand and the issue
 * is audited.
 *
 * Not the patient-lookup QR on the record page: that one only encodes the patient code.
 *
 * Required permission: patients → write
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('_id active').lean<{ active?: boolean }>();
    if (!patient) return notFound('Patient');
    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'This patient is inactive, so they can’t sign in to the app.' },
        { status: 409 }
      );
    }

    const { qrData, expiresAt } = await issuePatientLoginQr(id, { tenantId: ctx.tenantId });

    const { createAuditLog } = await import('@/lib/audit');
    void createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      isSensitive: true,
      description: `Staff issued a single-use app sign-in QR code (valid ${LOGIN_QR_TTL_MINUTES} minutes)`,
    });

    return NextResponse.json(
      { success: true, data: { qrData, expiresAt } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error issuing patient login QR (staff)', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to create the sign-in QR code' }, { status: 500 });
  }
}

/**
 * DELETE /api/patients/[id]/login-qr
 *
 * Staff-only. Revokes the patient's current sign-in QR (e.g. a printout was lost) and signs the
 * patient out of the app everywhere: a QR that was already scanned can't be told apart from
 * the patient's other sessions, so all are revoked (and push registrations removed). The
 * patient signs in again with a code or password.
 *
 * Required permission: patients → write
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('_id').lean();
    if (!patient) return notFound('Patient');

    await revokeAllPatientAccess(id);

    const { createAuditLog } = await import('@/lib/audit');
    void createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: ctx.tenantId,
      action: 'delete',
      resource: 'patient',
      resourceId: id,
      dataSubject: id,
      isSensitive: true,
      description: 'Staff revoked the app sign-in QR code and signed the patient out of the app',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error revoking patient login QR (staff)', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to revoke the sign-in QR code' }, { status: 500 });
  }
}
