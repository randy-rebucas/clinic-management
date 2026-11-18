import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { emcrAccountPasswordChange, emcrAccountRefreshState, issuePatientToken, PATIENT_TOKEN_TTL_SECONDS } from '@/app/lib/dal';
import { accountAccess } from '@/lib/emcr/account';
import {
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshFamily,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/app/lib/refresh-tokens';
import { jsonObject } from '@/lib/api/validate';

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
 * A chain begun with a clinic's temporary eMCR password keeps the pending-password-change claim
 * (`passwordChangeRequired: true`) until the account's password has been changed; it dies
 * (REFRESH_INVALID) if the password was cancelled by a phone sign-in meanwhile.
 */
export async function POST(request: NextRequest) {
  // Not the strict sign-in limit: refresh tokens are 256-bit random (nothing to guess), and
  // many phones share one carrier IP.
  const limited = await applyRateLimit(request, rateLimiters.api);
  if (limited) return limited;

  let body: { refreshToken?: unknown };
  try {
    body = jsonObject(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }

  const invalid = (code: string) =>
    NextResponse.json({ success: false, error: 'Please sign in again.', code }, { status: 401 });

  try {
    const consumed = await consumeRefreshToken(body.refreshToken, 'patient');
    if (!consumed.ok) return invalid(consumed.code);
    const { subjectId, sessionVersion, family, tid, acc, rel, av } = consumed.value;
    let { pwc } = consumed.value;

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

    // The chain dies with its eMCR account (deleted or disabled by the clinic): every request
    // would refuse the new token anyway (verifyPatientSession), which left the app in a
    // 401 → refresh → 401 loop.
    const account = acc ? await emcrAccountRefreshState(acc) : undefined;
    if (account && !account.ok) {
      await revokeRefreshFamily(family);
      return invalid('REFRESH_INVALID');
    }
    const accountVersion = account?.sessionVersion;
    if (rel === 'guardian') {
      // A guardian chain also dies when its account's session version moves on (account
      // password set/reset, "sign out everywhere"): no Patient.sessionVersion bump reaches it.
      // And when the account no longer manages the record (dependent removed, turned 18, or the
      // link's clinic is outside this session's scope), as verifyPatientAuth would refuse it.
      const access = acc ? await accountAccess(acc, subjectId) : null;
      const outOfScope = !!(access?.tid && tid && access.tid !== tid);
      if ((av ?? 0) !== accountVersion || !access || outOfScope) {
        await revokeRefreshFamily(family);
        return invalid('REFRESH_INVALID');
      }
    }

    // A chain begun with a clinic's temporary password keeps owing the change (`pwc`) until the
    // holder has chosen their own password. If the password is gone instead (the phone was proven,
    // which cancels a clinic's password), whoever held the temporary one must sign in again.
    if (pwc && acc) {
      const state = await emcrAccountPasswordChange(acc);
      if (state === 'gone') {
        await revokeRefreshFamily(family);
        return invalid('REFRESH_INVALID');
      }
      if (state === 'done') pwc = undefined;
    }

    const token = await issuePatientToken(patient, { tid, acc, rel, av: accountVersion, pwc });
    const refreshToken = await issueRefreshToken('patient', patient._id, sessionVersion, family, { tid, acc, rel, av: accountVersion, pwc });

    return NextResponse.json({
      success: true,
      token,
      tokenType: 'Bearer',
      expiresIn: PATIENT_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
      passwordChangeRequired: !!pwc,
    });
  } catch (error) {
    logger.error('Error refreshing patient token', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to refresh session' }, { status: 500 });
  }
}
