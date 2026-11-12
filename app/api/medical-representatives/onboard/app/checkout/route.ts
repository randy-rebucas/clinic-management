import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { tenantScope } from '@/models/staff-user-link';
import { sanitizeEmail } from '@/app/lib/security';
import { applyAuthRateLimits } from '@/lib/middleware/rate-limit';
import { isMedRepSelfSignupEnabled } from '@/lib/medrep-signup';
import {
  activationFeeOnline,
  activationReference,
  createActivationCheckout,
  publicOrigin,
} from '@/lib/medrep-app-signup';

const INVALID = () => NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 });

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('timing-equalizer-not-a-password', 12));

/**
 * POST /api/medical-representatives/onboard/app/checkout
 * Body: { email, password } → { checkoutUrl, reference, fee }
 *
 * A new activation checkout for a rep whose account isn't paid yet: sign-in answers MEDREP_INACTIVE,
 * and the app offers "Pay activation fee", which calls this with the same credentials.
 * Same refusal for unknown email and wrong password, and the same rate limits as sign-in.
 */
export async function POST(request: NextRequest) {
  if (!isMedRepSelfSignupEnabled()) {
    return NextResponse.json({ success: false, error: 'Medical representative registration is paused.', code: 'SIGNUP_PAUSED' }, { status: 410 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? sanitizeEmail(body.email) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ success: false, error: 'Email and password are required.' }, { status: 400 });

  const limited = await applyAuthRateLimits(request, `medrep:${email}`);
  if (limited) return limited;

  try {
    await connectDB();
    const user = await User.findOne({ email, ...tenantScope(null) }).select('+password medicalRepresentativeProfile');
    const match = await bcrypt.compare(password, user?.password || getDummyHash());
    if (!user || !user.password || !match || !user.medicalRepresentativeProfile) return INVALID();

    const rep = await MedicalRepresentative.findById(user.medicalRepresentativeProfile).select(
      'firstName lastName company email isActivated paymentStatus'
    );
    if (!rep) return INVALID();
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

    const checkoutUrl = await createActivationCheckout({ rep, fee, origin: publicOrigin(request.nextUrl.origin) });
    await MedicalRepresentative.updateOne({ _id: rep._id }, { $set: { paymentAmount: fee } });
    return NextResponse.json(
      { success: true, checkoutUrl, reference: activationReference(rep._id), fee },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error creating rep activation checkout', error as Error);
    return NextResponse.json({ success: false, error: 'Couldn’t start the payment. Please try again.' }, { status: 500 });
  }
}
