import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientByIdWithAuthFields, setPatientPassword } from '@/lib/data/patient';

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/patients/me/change-password
 * Body: { currentPassword, newPassword }
 * - If the patient has no password yet, currentPassword is not required
 *   (allows setting an initial password after QR/OTP login)
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  try {
    let body: { currentPassword?: string; newPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
    }

    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { success: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long` },
        { status: 400 }
      );
    }

    const patient = await runAsSystem(() => getPatientByIdWithAuthFields(session.patientId));

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }

    if (patient.active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    if (patient.password) {
      if (!currentPassword) {
        return NextResponse.json({ success: false, error: 'Current password is required' }, { status: 400 });
      }
      const match = await bcrypt.compare(currentPassword, patient.password);
      if (!match) {
        return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await runAsSystem(() => setPatientPassword(patient.id, hashed));

    logger.info('Patient changed password', { patientId: session.patientId });

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    logger.error('Error changing patient password', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to update password' }, { status: 500 });
  }
}
