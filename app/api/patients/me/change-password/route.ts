import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

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
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    let body: { currentPassword?: string; newPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        },
        { status: 400 }
      );
    }

    // Load patient with password field
    const patient = await Patient.findById(session.patientId).select('+password');

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'Account is inactive.' },
        { status: 403 }
      );
    }

    // If the patient already has a password, verify it before allowing a change
    if (patient.password) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Current password is required' },
          { status: 400 }
        );
      }
      const match = await bcrypt.compare(currentPassword, patient.password);
      if (!match) {
        return NextResponse.json(
          { success: false, error: 'Current password is incorrect' },
          { status: 401 }
        );
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await Patient.updateOne({ _id: patient._id }, { $set: { password: hashed } });

    logger.info('Patient changed password', { patientId: session.patientId });

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error: any) {
    logger.error('Error changing patient password', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to update password' },
      { status: 500 }
    );
  }
}
