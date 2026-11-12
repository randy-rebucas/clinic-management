import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { tenantScope } from '@/models/staff-user-link';
import { sanitizeEmail } from '@/app/lib/security';
import { applyAuthRateLimits, applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isMedRepSelfSignupEnabled } from '@/lib/medrep-signup';
import {
  activationFeeOnline,
  activationReference,
  createActivationCheckout,
  findRepByActivationToken,
  issueActivationToken,
  publicOrigin,
} from '@/lib/medrep-app-signup';

const INVALID = () => NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });
const PASS_EXPIRED = () =>
  NextResponse.json(
    { success: false, error: 'This payment link has expired. Sign in again to pay.', code: 'ACTIVATION_EXPIRED' },
    { status: 401 }
  );

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('timing-equalizer-not-a-password', 12));

const REP_FIELDS = 'firstName lastName company email isActivated paymentStatus';

/**
 * POST /api/medical-representatives/onboard/app/checkout
 * Body: { email, password } or { activationToken }, plus optional { returnUrl }
 * → { checkoutUrl, reference, fee, activationToken, activationExpiresAt }
 *
 * A new activation checkout for a rep whose account isn't paid yet: sign-in answered MEDREP_INACTIVE
 * and the app offers "Pay activation fee". A password sign-in sends the same credentials; a code
 * sign-in sends the `activationToken` it got with its MEDREP_INACTIVE answer.
 * `returnUrl` (the app's deep link) is where PayMongo's success page sends the browser back to.
 * The answer carries a fresh pass, which the app trades for a session at ./activation once paid.
 */
export async function POST(request: NextRequest) {
  if (!isMedRepSelfSignupEnabled()) {
    return NextResponse.json({ success: false, error: 'Medical representative registration is paused.', code: 'SIGNUP_PAUSED' }, { status: 410 });
  }

  let body: { email?: unknown; password?: unknown; activationToken?: unknown; returnUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    await connectDB();
    let rep;
    if (body.activationToken !== undefined) {
      const limited = await applyRateLimit(request, rateLimiters.auth);
      if (limited) return limited;
      const owner = await findRepByActivationToken(body.activationToken);
      if (!owner) return PASS_EXPIRED();
      rep = await MedicalRepresentative.findById(owner._id).select(REP_FIELDS);
      if (!rep) return PASS_EXPIRED();
    } else {
      const email = typeof body.email === 'string' ? sanitizeEmail(body.email) : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!email || !password) return NextResponse.json({ success: false, error: 'Email and password are required.' }, { status: 400 });

      const limited = await applyAuthRateLimits(request, `medrep:${email}`);
      if (limited) return limited;

      const user = await User.findOne({ email, ...tenantScope(null) }).select('+password medicalRepresentativeProfile');
      const match = await bcrypt.compare(password, user?.password || getDummyHash());
      if (!user || !user.password || !match || !user.medicalRepresentativeProfile) return INVALID();
      rep = await MedicalRepresentative.findById(user.medicalRepresentativeProfile).select(REP_FIELDS);
      if (!rep) return INVALID();
    }

    if (rep.isActivated || rep.paymentStatus === 'completed') {
      return NextResponse.json({ success: false, error: 'Your account is already activated. Sign in.', code: 'ALREADY_ACTIVE' }, { status: 409 });
    }

    const { online, fee } = await activationFeeOnline();
    if (!online) {
      return NextResponse.json(
        {
          success: false,
          error: 'Our team activates new accounts. We’ll email you once yours is ready.',
          code: 'ACTIVATION_BY_TEAM',
          reference: activationReference(rep._id),
        },
        { status: 409 }
      );
    }

    const returnUrl = typeof body.returnUrl === 'string' ? body.returnUrl : null;
    const checkoutUrl = await createActivationCheckout({ rep, fee, origin: publicOrigin(request.nextUrl.origin), returnUrl });
    await MedicalRepresentative.updateOne({ _id: rep._id }, { $set: { paymentAmount: fee } });
    const pass = await issueActivationToken(rep._id);
    return NextResponse.json(
      {
        success: true,
        checkoutUrl,
        reference: activationReference(rep._id),
        fee,
        activationToken: pass.token,
        activationExpiresAt: pass.expiresAt,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error creating rep activation checkout', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t start the payment. Please try again.' }, { status: 500 });
  }
}
