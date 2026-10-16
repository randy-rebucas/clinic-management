import { NextRequest, NextResponse } from 'next/server';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import logger from '@/lib/logger';
import { issuePatientLoginQr, revokePatientLoginQr } from '../../auth/shared';

/**
 * POST /api/patients/me/login-qr
 * Issues a new login QR for the authenticated patient (revoking any previous one).
 * Returns { qrData, expiresAt }; render `qrData` as the QR image content.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  try {
    const { qrData, expiresAt } = await issuePatientLoginQr(session.patientId);
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
 * Revokes the patient's current login QR.
 */
export async function DELETE(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  try {
    await revokePatientLoginQr(session.patientId);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error revoking patient login QR', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to revoke login QR' }, { status: 500 });
  }
}
