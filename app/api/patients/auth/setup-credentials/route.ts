import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { isFreshOtpSession } from '@/app/lib/dal';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import {
  checkPhoneProof,
  emailUsedForLoginByOtherPatient,
  otpFailureResponse,
  otpRequiredResponse,
  rotatePatientSessionAfterPasswordChange,
} from '../shared';

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/patients/auth/setup-credentials
 *
 * Registers or updates the email + password a patient uses to log into
 * third-party applications. Requires an authenticated patient session plus proof:
 *
 *   - No password yet: proof of the patient's phone. Either the access token comes from an OTP
 *     sign-in (`amr: "otp"`) in the last 15 minutes, or a fresh SMS code is sent as `otp`.
 *     Otherwise 400 OTP_REQUIRED. A login QR alone can't set credentials: whoever holds a QR
 *     printout must not be able to take over the account.
 *   - Password already set: `currentPassword` (400 CURRENT_PASSWORD_REQUIRED /
 *     400 WRONG_CURRENT_PASSWORD), or the same phone proof (a reset).
 *
 * Typical flow (first-time activation in the eMCR app):
 *   1. POST /api/patients/auth/otp/request with the registered phone number.
 *   2. POST /api/patients/auth/token (method: "otp") → Bearer token (amr "otp").
 *   3. Within 15 minutes, call this endpoint to set email + password.
 *
 * Body: { email?, password, currentPassword?, otp?, deviceId? }
 *
 *   email           – optional; update/set login email. If omitted, existing
 *                     email is kept. Rejected (409 EMAIL_IN_USE) when another
 *                     patient already signs in with it, in any clinic.
 *   password        – required; new password (min 8 chars).
 *   currentPassword – see above.
 *   otp             – optional SMS code, as phone proof.
 *   deviceId        – optional; keeps this device's push registration.
 *
 * Bearer callers get a new `token`, `expiresIn`, `refreshToken` and `refreshExpiresIn`.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'refuse' });

  if (!session) return patientAuthError(request);

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `patient-pw:${session.patientId}`);
  if (limited) return limited;

  try {
    await connectDB();

    let body: { email?: string; password?: string; currentPassword?: string; otp?: unknown; deviceId?: unknown };
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
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json(
        { success: false, error: 'Account is inactive.' },
        { status: 403 }
      );
    }

    // ── Proof: current password, or proof of the patient's phone ────────────
    let phoneProven = isFreshOtpSession(session);
    const needsPhoneProof = !patient.password || !currentPassword;
    if (needsPhoneProof && !phoneProven && body.otp !== undefined) {
      const proof = await checkPhoneProof(session, body.otp);
      if (!proof.ok) return otpFailureResponse(proof.reason);
      phoneProven = proof.proven;
    }

    if (patient.password) {
      if (currentPassword) {
        const match = await bcrypt.compare(currentPassword, patient.password);
        if (!match) {
          return NextResponse.json(
            { success: false, error: 'Current password is incorrect', code: 'WRONG_CURRENT_PASSWORD' },
            // 400, not 401: the session is fine, so the app must not treat it as an expired token.
            { status: 400 }
          );
        }
      } else if (!phoneProven) {
        return NextResponse.json(
          {
            success: false,
            code: 'CURRENT_PASSWORD_REQUIRED',
            error: 'currentPassword is required when updating an existing password',
          },
          { status: 400 }
        );
      }
    } else if (!phoneProven) {
      return otpRequiredResponse();
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

      // Sign-in looks patients up by email across every clinic, so a login email must not be
      // in use by any other patient who signs in with a password.
      if (await emailUsedForLoginByOtherPatient(newEmail, patient._id)) {
        return NextResponse.json(
          {
            success: false,
            code: 'EMAIL_IN_USE',
            error: 'This email is already used to sign in by another patient. Please use a different email.',
          },
          { status: 409 }
        );
      }

      updates.email = newEmail;
    }

    // ── Hash and save ────────────────────────────────────────────────────────
    updates.password = await bcrypt.hash(newPassword, 12);

    // Set after proving the phone: the patient's own password, without a staff clinic scope.
    await Patient.updateOne(
      { _id: patient._id },
      phoneProven ? { $set: updates, $unset: { passwordTenantId: 1 } } : { $set: updates }
    );

    // Any previously issued token (other devices, leaked tokens) stops working. The caller's
    // fresh token keeps its clinic scope unless the phone was proven.
    const keepDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() || undefined : undefined;
    const rotated = await rotatePatientSessionAfterPasswordChange(request, session.patientId, {
      tid: phoneProven ? undefined : session.tid,
      keepDeviceId,
    });

    logger.info('Patient credentials set up for third-party access', {
      patientId: session.patientId,
      emailUpdated: !!updates.email,
    });

    return rotated.apply(NextResponse.json({
      success: true,
      message:
        'Credentials saved. You can now log in with email and password on any supported application.',
      email: updates.email ?? patient.email ?? null,
      ...rotated.bodyFields,
    }));
  } catch (error: any) {
    logger.error('Error setting up patient credentials', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to save credentials. Please try again.' },
      { status: 500 }
    );
  }
}
