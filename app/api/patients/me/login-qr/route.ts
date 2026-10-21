import { NextRequest, NextResponse } from 'next/server';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import logger from '@/lib/logger';
import { issuePatientLoginQr, rotatePatientSessionAfterPasswordChange } from '../../auth/shared';

/**
 * POST /api/patients/me/login-qr
 * Issues a new login QR for the authenticated patient (revoking any previous unused one), to
 * sign in on another device by scanning it from this one. Single use, expires after 15 minutes.
 * A clinic-scoped session (`tid`) can only issue a QR with the same scope.
 * Returns { qrData, expiresAt }; render `qrData` as the QR image content.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  try {
    const { qrData, expiresAt } = await issuePatientLoginQr(session.patientId, { tenantId: session.tid });
    return NextResponse.json(
      { success: true, data: { qrData, expiresAt } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error issuing patient login QR', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to create login QR' }, { status: 500 });
  }
}

/**
 * DELETE /api/patients/me/login-qr
 * Revokes the patient's current login QR and signs out every session (a session started from an
 * already-scanned QR can't be told apart from others). The caller stays signed in: Bearer callers
 * get a new `token`, `expiresIn`, `refreshToken`, `refreshExpiresIn`; cookie callers a new cookie.
 * Optional body `{ deviceId }` keeps this device's push registration.
 */
export async function DELETE(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });
  if (!session) return patientAuthError(request);

  let deviceId: string | undefined;
  try {
    const text = await request.text();
    const body = text ? JSON.parse(text) : null;
    if (typeof body?.deviceId === 'string' && body.deviceId.trim()) deviceId = body.deviceId.trim();
  } catch {
    // optional body
  }

  try {
    const rotated = await rotatePatientSessionAfterPasswordChange(request, session.patientId, {
      tid: session.tid,
      keepDeviceId: deviceId,
      acc: session.acc,
      amr: null,
    });
    return rotated.apply(NextResponse.json({ success: true, ...rotated.bodyFields }));
  } catch (error) {
    logger.error('Error revoking patient login QR', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to revoke login QR' }, { status: 500 });
  }
}
