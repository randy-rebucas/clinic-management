import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { issuePending2faToken } from '@/app/lib/dal';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { hashInviteToken } from '@/lib/user-invite';
import { findRepByActivationToken } from '@/lib/medrep-app-signup';
import { paidTotal, retrieveCheckoutSession } from '@/lib/paymongo';
import { applyPaidCheckout } from '@/lib/paymongo-apply';
import { repTokenResponse } from '../../../_lib/rep-login';

const expired = () =>
  NextResponse.json(
    { success: false, error: 'This payment link has expired. Sign in again.', code: 'ACTIVATION_EXPIRED' },
    { status: 401 }
  );

/**
 * POST /api/medical-representatives/onboard/app/activation
 * Body: { activationToken }
 *
 * The app asks this after the PayMongo page (and again every few seconds) with the pass from
 * ./checkout or ./complete. Until the payment webhook activates the rep: `{ activated: false }`.
 * Once it has: the pass is spent and the answer is a sign-in, exactly as POST /auth/token gives
 * (or `{ requires2fa, pendingToken }` for an account with an authenticator app).
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;

  let body: { activationToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    await connectDB();
    let rep = await findRepByActivationToken(body.activationToken);
    if (!rep) return expired();

    // Not active yet but a checkout was made: ask PayMongo, and apply a paid one the same way the
    // webhook does (applyPaidCheckout is safe to repeat). Covers a late webhook, and local development.
    if (!rep.isActivated && rep.activationCheckoutId) {
      try {
        const session = await retrieveCheckoutSession(rep.activationCheckoutId);
        if (paidTotal(session) > 0 && session.metadata?.purpose === 'medrep' && session.metadata?.repId === String(rep._id)) {
          const applied = await applyPaidCheckout(session);
          if (!applied.ok) logger.warn('Rep activation payment not applied yet', { repId: String(rep._id), error: applied.error });
          rep = (await findRepByActivationToken(body.activationToken)) ?? rep;
        }
      } catch (error) {
        // PayMongo didn't answer: the webhook, or the next look, will do.
        logger.warn('Could not read the rep activation checkout', { repId: String(rep._id), error: String(error) });
      }
    }

    if (!rep.isActivated || rep.status !== 'active') {
      return NextResponse.json(
        { success: true, activated: false, paymentStatus: rep.paymentStatus },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Spend the pass in the same step that finds it, so it signs in once.
    const spent = await MedicalRepresentative.findOneAndUpdate(
      { _id: rep._id, activationTokenHash: hashInviteToken(String(body.activationToken)) },
      { $unset: { activationTokenHash: 1, activationTokenExpiresAt: 1 } }
    );
    if (!spent) return expired();

    const user = rep.userId ? await User.findById(rep.userId).populate('role') : null;
    if (!user || (user.role as any)?.name !== 'medical-representative' || user.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Your account is active. Sign in with your email and password.', code: 'SIGN_IN_REQUIRED' },
        { status: 409 }
      );
    }

    if (user.totpEnabled) {
      const pendingToken = await issuePending2faToken(user._id.toString(), undefined);
      return NextResponse.json(
        { success: false, requires2fa: true, pendingToken, error: 'Two-factor authentication required.' },
        { status: 401 }
      );
    }

    return await repTokenResponse(request, {
      user,
      medicalRep: rep,
      roleId: (user.role as any)?._id?.toString(),
      tenantId: null,
      email: String(user.email),
    });
  } catch (error) {
    logger.error('Error checking rep activation', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
