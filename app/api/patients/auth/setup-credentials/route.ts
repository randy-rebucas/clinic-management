import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import {
  getPatientByIdWithAuthFields,
  findPatientAcrossTenantsWithAuthFields,
  updatePatientEmail,
  setPatientPassword,
} from '@/lib/data/patient';

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/patients/auth/setup-credentials
 * See original docstring (unchanged) for the two typical flows this supports.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login first.' }, { status: 401 });
  }

  try {
    let body: { email?: string; password?: string; currentPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
    }

    const newPassword = typeof body.password === 'string' ? body.password : '';
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newEmail = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long` },
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
        return NextResponse.json(
          { success: false, error: 'currentPassword is required when updating an existing password' },
          { status: 400 }
        );
      }
      const match = await bcrypt.compare(currentPassword, patient.password);
      if (!match) {
        return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 });
      }
    }

    if (newEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
      }

      const patientTenantIds = patient.tenants.map((t) => t.tenantId);
      for (const tid of patientTenantIds) {
        const conflict = await runAsSystem(() =>
          findPatientAcrossTenantsWithAuthFields({ email: newEmail, tenantId: tid })
        );
        if (conflict && conflict.id !== patient.id) {
          return NextResponse.json(
            { success: false, error: 'This email is already registered to another patient in the same clinic.' },
            { status: 409 }
          );
        }
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await runAsSystem(() => setPatientPassword(patient.id, passwordHash));
    if (newEmail) {
      await runAsSystem(() => updatePatientEmail(patient.id, newEmail));
    }

    logger.info('Patient credentials set up for third-party access', {
      patientId: session.patientId,
      emailUpdated: !!newEmail,
    });

    return NextResponse.json({
      success: true,
      message: 'Credentials saved. You can now log in with email and password on any supported application.',
      email: newEmail || patient.email || null,
    });
  } catch (error: any) {
    logger.error('Error setting up patient credentials', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to save credentials. Please try again.' }, { status: 500 });
  }
}
