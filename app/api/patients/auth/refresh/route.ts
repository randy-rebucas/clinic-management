import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { issuePatientToken, PATIENT_TOKEN_TTL_SECONDS } from '@/app/lib/dal';
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshFamily,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/app/lib/refresh-tokens';

/**
 * POST /api/patients/auth/refresh
 * Body: { refreshToken }
 *
 * Trade a refresh token for a new access token and a new refresh token (the old one is spent).
 * 401 `REFRESH_INVALID`: unknown, expired, revoked, or the patient signed out everywhere /
 * changed their password. 401 `REFRESH_REUSED`: the token was already spent, so every token in
 * its chain is revoked. Either way the app must sign in again.
 * 403 `ACCOUNT_INACTIVE`: the clinic deactivated the patient; show the message, don't retry.
 *
 * The new access token keeps the clinic scope (`tid`) and eMCR account (`acc`, `rel`) of the
 * original sign-in. It carries no
 * `amr`, so a refreshed token never counts as a fresh OTP sign-in.
 */
export async function POST(request: NextRequest) {
  // Not the strict sign-in limit: refresh tokens are 256-bit random (nothing to guess), and
  // many phones share one carrier IP.
  const limited = await applyRateLimit(request, rateLimiters.api);
  if (limited) return limited;

  let body: { refreshToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const invalid = (code: string) =>
    NextResponse.json({ success: false, error: 'Please sign in again.', code }, { status: 401 });

  try {
    const consumed = await consumeRefreshToken(body.refreshToken, 'patient');
    if (!consumed.ok) return invalid(consumed.code);
    const { subjectId, sessionVersion, family, tid, acc, rel } = consumed.value;

    await connectDB();
    const patient = await Patient.findById(subjectId).select('active patientCode email sessionVersion');
    if (!patient || (patient.sessionVersion ?? 0) !== sessionVersion) {
      await revokeRefreshFamily(family);
      return invalid('REFRESH_INVALID');
    }
    if (patient.active === false) {
      // The token is already spent; the patient signs in again once the clinic reactivates them.
      await revokeRefreshFamily(family);
      return NextResponse.json(
        { success: false, error: 'Your account is inactive. Please contact the clinic.', code: 'ACCOUNT_INACTIVE' },
        { status: 403 }
      );
    }

    const token = await issuePatientToken(patient, { tid, acc, rel });
    const refreshToken = await issueRefreshToken('patient', patient._id, sessionVersion, family, { tid, acc, rel });

    return NextResponse.json({
      success: true,
      token,
      tokenType: 'Bearer',
      expiresIn: PATIENT_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    logger.error('Error refreshing patient token', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to refresh session' }, { status: 500 });
  }
}
