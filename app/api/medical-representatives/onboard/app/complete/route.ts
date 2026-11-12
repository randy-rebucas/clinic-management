import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepAppSignup from '@/models/RepAppSignup';
import User from '@/models/User';
import { INITIAL_PASSWORD_LOCAL } from '@/models/staff-user-link';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isValidationError, parseBody } from '@/lib/api/validate';
import { hashInviteToken, isInviteTokenFormat, PASSWORD_MAX_BYTES, validatePasswordPolicy } from '@/lib/user-invite';
import {
  activationFeeOnline,
  activationReference,
  appSignupUnavailable,
  createActivationCheckout,
  findAppSignup,
  publicOrigin,
  signupExpiredResponse,
} from '@/lib/medrep-app-signup';

const schema = z.object({
  signupId: z.string().max(64),
  password: z.string().min(1).max(PASSWORD_MAX_BYTES * 4),
});

/**
 * POST /api/medical-representatives/onboard/app/complete
 * Body: { signupId, password }
 * → { id, reference, activation: 'payment' | 'review', checkoutUrl? }
 *
 * Both codes passed: create the rep with the chosen password. The account stays inactive until
 * the activation fee is paid (PayMongo webhook) or, with no online payment, our team activates it.
 * Without a checkoutUrl on 'payment' the checkout couldn't be made; ./checkout makes a new one.
 */
export async function POST(request: NextRequest) {
  const unavailable = appSignupUnavailable();
  if (unavailable) return unavailable;

  const ipLimited = await applyRateLimit(request, rateLimiters.auth);
  if (ipLimited) return ipLimited;

  try {
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { signupId, password } = parsed.data;

    await connectDB();
    const pending = await findAppSignup(signupId);
    if (!pending) return signupExpiredResponse();
    if (!pending.emailVerifiedAt || !pending.phoneVerifiedAt) {
      return NextResponse.json(
        { success: false, error: 'Confirm your email and mobile number first.', code: 'NOT_VERIFIED' },
        { status: 409 }
      );
    }

    // Checked before the signup is spent, so a weak password can be fixed and sent again.
    const name = `${pending.fields.firstName} ${pending.fields.lastName}`.trim();
    const policyErrors = validatePasswordPolicy(password, { email: pending.email, name });
    if (policyErrors.length > 0) {
      return NextResponse.json({ success: false, error: policyErrors.join(' '), code: 'WEAK_PASSWORD' }, { status: 400 });
    }

    // Spent here, once: a double tap can't create two reps.
    if (!isInviteTokenFormat(signupId)) return signupExpiredResponse();
    const signup = await RepAppSignup.findOneAndDelete({
      tokenHash: hashInviteToken(signupId),
      expiresAt: { $gt: new Date() },
      emailVerifiedAt: { $exists: true },
      phoneVerifiedAt: { $exists: true },
    });
    if (!signup) return signupExpiredResponse();

    const email = signup.email;
    if ((await MedicalRepresentative.exists({ email })) || (await User.exists({ email }))) {
      return NextResponse.json(
        { success: false, error: 'This email already has an account. Please sign in.', code: 'EMAIL_TAKEN' },
        { status: 409 }
      );
    }

    const { online, fee } = await activationFeeOnline();
    const rep = new MedicalRepresentative({
      ...signup.fields,
      email,
      phone: signup.phoneE164,
      products: [],
      status: 'inactive',
      isActivated: false,
      paymentStatus: 'pending',
    });
    // The account gets this password and no emailed invite (see the model's post-save hook).
    rep.$locals[INITIAL_PASSWORD_LOCAL] = await bcrypt.hash(password, 12);
    await rep.save();

    const account = await User.exists({ medicalRepresentativeProfile: rep._id });
    if (!account) {
      // The hook logs its own failure; without a login the rep can't go on, so say so.
      logger.error('Rep app signup created a rep without a login', new Error('No user for rep'), { repId: String(rep._id) });
      return NextResponse.json(
        { success: false, error: 'Your account couldn’t be finished. Please contact support.', reference: activationReference(rep._id) },
        { status: 500 }
      );
    }

    let checkoutUrl: string | undefined;
    if (online) {
      try {
        checkoutUrl = await createActivationCheckout({ rep, fee, origin: publicOrigin(request.nextUrl.origin) });
        await MedicalRepresentative.updateOne({ _id: rep._id }, { $set: { paymentAmount: fee } });
      } catch (error) {
        logger.error('PayMongo activation checkout failed (app signup)', error as Error);
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: String(rep._id),
        reference: activationReference(rep._id),
        activation: online ? 'payment' : 'review',
        fee: online ? fee : undefined,
        checkoutUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Error completing rep app signup', error as Error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
