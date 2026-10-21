import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { normalizePhone } from '@/lib/phone';
import { phoneRateKey } from '@/app/api/patients/auth/shared';
import { linkRecordsByVerifiedPhone } from '@/app/api/patients/me/_lib/linked-records';
import { countPeopleOnPhone, issueClaimToken } from '@/lib/emcr/claim';
import { accountSessionFields, accountView, consumeAccountOtp, otpFailure } from '@/lib/emcr/session';

/**
 * POST /api/emcr/auth/otp/verify
 * Body: { phone, otp }
 *
 * Prove the phone. Always returns a `claimToken` (15 minutes) for POST /api/emcr/auth/claim,
 * the "Is this your record?" step, and `peopleOnNumber` (how many people the clinics have on this
 * number; never their names).
 *
 * When the account already has a profile (a returning user), it also signs in: `session` holds
 * the Bearer token fields (same shape as POST /api/patients/auth/token). Otherwise
 * `session` is null and the app asks the questions.
 */
export async function POST(request: NextRequest) {
  let body: { phone?: unknown; otp?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  if (!phone || !otp) return NextResponse.json({ success: false, error: 'phone and otp are required' }, { status: 400 });

  const limited = await applyAuthRateLimits(request, phoneRateKey(phone));
  if (limited) return limited;

  try {
    const result = await consumeAccountOtp(phone, otp);
    if (!result.ok) return otpFailure(result.reason);
    const { account } = result;

    if (account.selfPatientId) {
      // New clinic records of the holder may have appeared since the last sign-in.
      await linkRecordsByVerifiedPhone(String(account.selfPatientId), phone).catch((error) =>
        logger.error('eMCR record linking failed', error as Error)
      );
    }

    const [session, view, peopleOnNumber] = await Promise.all([
      accountSessionFields(account),
      accountView(account),
      countPeopleOnPhone(phone),
    ]);
    const claim = issueClaimToken(String(account._id), phone);
    logger.info('eMCR phone verified', { accountId: String(account._id), signedIn: !!session });

    return NextResponse.json({
      success: true,
      claimToken: claim.token,
      claimExpiresAt: claim.expiresAt.toISOString(),
      peopleOnNumber,
      account: view,
      session,
    });
  } catch (error) {
    logger.error('Error in eMCR OTP verify', error as Error);
    return NextResponse.json({ success: false, error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
