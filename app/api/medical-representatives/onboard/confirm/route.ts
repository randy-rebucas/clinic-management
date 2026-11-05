import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepSignup from '@/models/RepSignup';
import User from '@/models/User';
import { sendEmail } from '@/lib/email';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { getPlatformFees } from '@/lib/platform-config';
import { isMedRepSelfSignupEnabled } from '@/lib/medrep-signup';
import { sendDeferredRepInvite } from '@/lib/medrep-invite';
import { hashInviteToken, isInviteTokenFormat } from '@/lib/user-invite';

const MIN_ONLINE_FEE = 20;

/**
 * POST /api/medical-representatives/onboard/confirm  { token }
 * The owner of the address confirmed it: create the rep and start payment. A POST on purpose, since
 * mail scanners open links, and the token is spent in the same step that finds the signup.
 */
export async function POST(request: NextRequest) {
  if (!isMedRepSelfSignupEnabled()) {
    return NextResponse.json({ success: false, error: 'Medical representative registration is paused.' }, { status: 410 });
  }

  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const expired = NextResponse.json(
    { success: false, error: 'This link has expired or was already used. Please register again.' },
    { status: 400 }
  );
  if (!isInviteTokenFormat(body?.token)) return expired;

  try {
    await connectDB();
    const signup = await RepSignup.findOneAndDelete({ tokenHash: hashInviteToken(body.token), expiresAt: { $gt: new Date() } });
    if (!signup) return expired;

    // The address may have been taken since the link was sent. They own it, so saying so is fine.
    const { email, fields } = signup;
    if ((await MedicalRepresentative.findOne({ email })) || (await User.findOne({ email }))) {
      return NextResponse.json(
        { success: false, error: 'This email already has an account. Please sign in or contact support.' },
        { status: 409 }
      );
    }

    const fee = (await getPlatformFees()).medrepActivationFee;
    const paysOnline = (await isPayMongoConfigured()) && fee >= MIN_ONLINE_FEE;

    // All self-registrations are inactive until a payment webhook activates them.
    const medicalRep = new MedicalRepresentative({
      ...fields,
      email,
      status: 'inactive',
      isActivated: false,
      paymentStatus: 'pending',
      // With online payment the invite waits for it; with none, nothing would ever send it later.
      inviteDeferred: paysOnline,
    });
    await medicalRep.save();

    await sendEmail({
      to: email,
      subject: 'Medical Representative Registration Received',
      html: `<h1>Your registration was received</h1>
<p>Your account stays inactive until your activation is complete. We'll email you a link to set your password.</p>`,
    }).catch((error) => logger.warn('Rep registration email failed', { error: String(error) }));

    let checkoutUrl: string | undefined;
    if (paysOnline) {
      try {
        const origin = request.headers.get('origin') || (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
        const checkout = await createCheckoutSession({
          name: 'MyClinicSoft medical representative activation',
          amount: fee,
          description: `Activation for ${medicalRep.firstName} ${medicalRep.lastName}, ${medicalRep.company}`,
          referenceNumber: `MR-${String(medicalRep._id).slice(-8).toUpperCase()}`,
          successUrl: `${origin}/medical-representatives/onboard/success?id=${medicalRep._id}&paid=1`,
          cancelUrl: `${origin}/medical-representatives/onboard/success?id=${medicalRep._id}`,
          email,
          metadata: { purpose: 'medrep', repId: String(medicalRep._id), amount: String(fee) },
        });
        checkoutUrl = checkout.checkoutUrl;
        medicalRep.paymentAmount = fee;
        await medicalRep.save();
      } catch (error) {
        // Registration stands. No checkout means no payment webhook, so the invite can't wait for one.
        logger.error('PayMongo activation checkout failed', error as Error);
        await sendDeferredRepInvite(medicalRep._id);
      }
    }

    return NextResponse.json({ success: true, checkoutUrl, id: medicalRep._id }, { status: 201 });
  } catch (error) {
    logger.error('Error confirming medical rep signup', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
