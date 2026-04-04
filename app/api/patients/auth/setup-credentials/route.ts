import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/patients/auth/setup-credentials
 *
 * Registers or updates the email + password a patient uses to log into
 * third-party applications. Requires the patient to be authenticated via
 * any existing method (cookie, Bearer token, or a freshly issued OTP token).
 *
 * Typical flows:
 *
 *   A. First-time credential setup (patient was registered by clinic staff)
 *      1. Patient receives a QR card from the clinic.
 *      2. Third-party app calls POST /api/patients/auth/otp/request with the
 *         patient's registered phone number.
 *      3. Patient enters the OTP in the app → POST /api/patients/auth/token
 *         (method: "otp") → receives a Bearer token.
 *      4. App calls this endpoint with the Bearer token to set email + password
 *         for all future logins.
 *
 *   B. Credential update (patient already has a password)
 *      Same flow — must supply currentPassword when one is already set.
 *
 * Body: { email?, password, currentPassword? }
 *
 *   email          – optional; update/set login email. If omitted, existing
 *                    email is kept. New email must not conflict with another
 *                    patient in the same tenant.
 *   password       – required; new password (min 8 chars).
 *   currentPassword – required when the patient already has a password set.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login first.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    let body: { email?: string; password?: string; currentPassword?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const newPassword = typeof body.password === 'string' ? body.password : '';
    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newEmail =
      typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';

    // ── Validate password ────────────────────────────────────────────────────
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        },
        { status: 400 }
      );
    }

    // ── Load patient (need password for current-password check) ─────────────
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

    // ── If password already set, require current password ───────────────────
    if (patient.password) {
      if (!currentPassword) {
        return NextResponse.json(
          {
            success: false,
            error:
              'currentPassword is required when updating an existing password',
          },
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

    // ── Validate new email (if provided) ────────────────────────────────────
    const updates: Record<string, any> = {};

    if (newEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }

      // Check uniqueness within the same tenants
      const emailConflictQuery: any = {
        email: newEmail,
        _id: { $ne: patient._id },
      };
      if (patient.tenantIds?.length) {
        emailConflictQuery.tenantIds = { $in: patient.tenantIds };
      }

      const conflict = await Patient.findOne(emailConflictQuery).lean();
      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error:
              'This email is already registered to another patient in the same clinic.',
          },
          { status: 409 }
        );
      }

      updates.email = newEmail;
    }

    // ── Hash and save ────────────────────────────────────────────────────────
    updates.password = await bcrypt.hash(newPassword, 12);

    await Patient.updateOne({ _id: patient._id }, { $set: updates });

    logger.info('Patient credentials set up for third-party access', {
      patientId: session.patientId,
      emailUpdated: !!updates.email,
    });

    return NextResponse.json({
      success: true,
      message:
        'Credentials saved. You can now log in with email and password on any supported application.',
      email: updates.email ?? patient.email ?? null,
    });
  } catch (error: any) {
    logger.error('Error setting up patient credentials', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to save credentials. Please try again.' },
      { status: 500 }
    );
  }
}
