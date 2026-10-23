import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { isFreshOtpSession } from '@/app/lib/dal';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { findAccountForSession, type EmcrAccountLean } from '@/lib/emcr/account';
import { accountPasswordMatches, passwordProblem, setAccountPassword } from '@/lib/emcr/password';
import { accountView } from '@/lib/emcr/session';

/**
 * POST /api/emcr/account/password (patient sign-in, guardian sessions included)
 * Body: { newPassword, currentPassword? }
 *
 * Create or change the password for signing in with the account's mobile number.
 * - First password, or a reset ("Forgot password"): the session must come from an SMS code in
 *   the last 15 minutes (`amr: "otp"`: phone sign-in, invite, or the forgot-password code).
 *   Otherwise 400 OTP_REQUIRED.
 * - Otherwise `currentPassword` must match (400 WRONG_CURRENT_PASSWORD). That includes the
 *   clinic's temporary password (`mustChangePassword`), which can't be kept.
 * → { account }
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request, { profile: 'ignore' });
  if (!session) return patientAuthError(request);

  let body: { newPassword?: unknown; currentPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const problem = passwordProblem(newPassword);
  if (problem) return NextResponse.json({ success: false, code: 'WEAK_PASSWORD', error: problem }, { status: 400 });

  try {
    const account = await findAccountForSession(session);
    if (!account?.phone || account.disabled) {
      return NextResponse.json(
        { success: false, code: 'OTP_REQUIRED', error: 'Sign in with an SMS code to your mobile number first.' },
        { status: 400 }
      );
    }

    const limited = await applyRateLimit(request, rateLimiters.authAccount, `emcr-pw:${account._id}`);
    if (limited) return limited;

    const phoneProven = isFreshOtpSession(session);
    if (currentPassword) {
      if (!(await accountPasswordMatches(account._id, currentPassword))) {
        return NextResponse.json({ success: false, code: 'WRONG_CURRENT_PASSWORD', error: 'Your current password is incorrect.' }, { status: 400 });
      }
      if (account.mustChangePassword && currentPassword === newPassword) {
        return NextResponse.json({ success: false, code: 'WEAK_PASSWORD', error: 'Choose a new password, not the one from the clinic.' }, { status: 400 });
      }
    } else if (!phoneProven) {
      return NextResponse.json(
        {
          success: false,
          code: account.passwordSetAt ? 'CURRENT_PASSWORD_REQUIRED' : 'OTP_REQUIRED',
          error: account.passwordSetAt
            ? 'Enter your current password, or use “Forgot password”.'
            : 'For your security, confirm your phone with an SMS code first.',
        },
        { status: 400 }
      );
    }

    await setAccountPassword(account._id, newPassword, 'user');
    await connectDB();
    const fresh = await EmcrAccount.findById(account._id).lean<EmcrAccountLean | null>();
    logger.info('eMCR account password set', { accountId: String(account._id), reset: !currentPassword && !!account.passwordSetAt });
    return NextResponse.json({ success: true, account: fresh ? await accountView(fresh) : null });
  } catch (error) {
    logger.error('Error setting eMCR account password', error as Error);
    return NextResponse.json({ success: false, error: 'The password wasn’t saved. Please try again.' }, { status: 500 });
  }
}
