import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isFreshOtpSession } from '@/app/lib/dal';
import {
  checkPhoneProof,
  otpFailureResponse,
  otpRequiredResponse,
  rotatePatientSessionAfterPasswordChange,
} from '../../auth/shared';

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /api/patients/me/change-password
 * Body: { currentPassword?, newPassword, otp?, deviceId? }
 *
 * - Patient has a password:
 *   - `currentPassword` given → must match (400 WRONG_CURRENT_PASSWORD).
 *   - no `currentPassword` → allowed only as a reset: the access token comes from an OTP sign-in
 *     (`amr: "otp"`) issued in the last 15 minutes ("forgot password" → code sign-in → here),
 *     or a fresh SMS code is sent as `otp`. Otherwise 400 CURRENT_PASSWORD_REQUIRED.
 * - No password yet (signed in by code or QR): setting the first one needs the same phone
 *   proof (fresh OTP sign-in or `otp`), else 400 OTP_REQUIRED, so a QR holder can't take over
 *   the account.
 *
 * Every other session, the login QR and other devices' push registrations are revoked; the
 * caller gets a new token pair (+ `expiresIn`). `deviceId` keeps this device's push registration.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  const limited = await applyRateLimit(request, rateLimiters.authAccount, `patient-pw:${session.patientId}`);
  if (limited) return limited;

  try {
    await connectDB();

    let body: { currentPassword?: string; newPassword?: string; otp?: unknown; deviceId?: unknown };
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
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json(
        { success: false, error: 'Account is inactive.' },
        { status: 403 }
      );
    }

    // Proof of the patient's phone (fresh OTP sign-in, or an `otp` code) when no current password.
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
          { success: false, error: 'Current password is required', code: 'CURRENT_PASSWORD_REQUIRED' },
          { status: 400 }
        );
      }
    } else if (!phoneProven) {
      return otpRequiredResponse();
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    // A password the patient set after proving their phone is theirs: it no longer carries the
    // clinic scope of a staff-set password.
    await Patient.updateOne(
      { _id: patient._id },
      phoneProven ? { $set: { password: hashed }, $unset: { passwordTenantId: 1 } } : { $set: { password: hashed } }
    );

    // Sign out every other device; the caller gets a fresh token (same clinic scope unless the
    // phone was proven, which grants the patient's full access).
    const keepDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() || undefined : undefined;
    const rotated = await rotatePatientSessionAfterPasswordChange(request, session.patientId, {
      tid: phoneProven ? undefined : session.tid,
      keepDeviceId,
    });

    logger.info('Patient changed password', { patientId: session.patientId });

    return rotated.apply(NextResponse.json({
      success: true,
      message: 'Password updated successfully',
      ...rotated.bodyFields,
    }));
  } catch (error: any) {
    logger.error('Error changing patient password', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to update password' },
      { status: 500 }
    );
  }
}
