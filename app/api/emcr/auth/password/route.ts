import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { normalizePhone } from '@/lib/phone';
import { maskPhone, phoneRateKey } from '@/app/api/patients/auth/shared';
import { authenticateAccountPassword } from '@/lib/emcr/password';
import { LOGIN_ID_DOMAIN, parseLoginId } from '@/lib/emcr/login-id';
import { accountSessionFields, accountView } from '@/lib/emcr/session';

/**
 * POST /api/emcr/auth/password
 * Body: { login, password }  (`phone` is accepted for `login`)
 *
 * Password sign-in on the eMCR account. `login` is the mobile number or the login ID
 * (`qc01.jdc.19900425@myclinicsoft.solutions`). → { account, session } (as otp/verify).
 * `account.mustChangePassword`: a temporary password from the clinic; the app must have the
 * holder choose their own (POST /api/emcr/account/password with it as `currentPassword`) before
 * going on. Wrong login or password: 401, the same either way.
 */
export async function POST(request: NextRequest) {
  let body: { login?: unknown; phone?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
  }
  const typed = typeof body.login === 'string' ? body.login : typeof body.phone === 'string' ? body.phone : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const byId = typed.trim().toLowerCase().endsWith(`@${LOGIN_ID_DOMAIN}`);
  const loginId = byId ? parseLoginId(typed) : null;
  const phone = byId ? null : normalizePhone(typed);
  if ((!loginId && !phone) || !password) {
    return NextResponse.json({ success: false, error: 'Enter your mobile number or login ID, and your password.' }, { status: 400 });
  }
  const login = loginId ? { loginId } : { phone: phone as string };

  const limited = await applyAuthRateLimits(request, loginId ? `emcr-login:${loginId}` : phoneRateKey(login.phone as string));
  if (limited) return limited;

  const wrong = NextResponse.json({ success: false, error: 'The login or password is incorrect.' }, { status: 401 });
  try {
    const account = await authenticateAccountPassword(login, password);
    if (!account) return wrong;

    const [session, view] = await Promise.all([accountSessionFields(account, 'password'), accountView(account)]);
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          code: 'NO_PROFILE',
          error: 'Your account has no records linked yet. Sign in with an SMS code, or ask your clinic for an app invite.',
        },
        { status: 409 }
      );
    }
    logger.info('eMCR password sign-in', { accountId: String(account._id), by: loginId ? 'loginId' : maskPhone(phone as string) });
    return NextResponse.json({ success: true, account: view, session }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    logger.error('Error in eMCR password sign-in', error as Error);
    return NextResponse.json({ success: false, error: 'Sign-in failed. Please try again.' }, { status: 500 });
  }
}
