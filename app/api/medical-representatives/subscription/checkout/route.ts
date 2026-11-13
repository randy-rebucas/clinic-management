import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createRepSubscriptionCheckout, RepCheckoutError } from '@/lib/rep-billing';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../../_lib/rep-session';

const schema = z.object({
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  plan: z.enum(['standard', 'pro']).default('standard'),
});

/**
 * POST /api/medical-representatives/subscription/checkout  { billingCycle?, plan? }
 * A PayMongo checkout for one month or year of standard or Pro, added after any time already
 * paid for (switching plan converts the time left; lib/rep-billing.ts). Open
 * `checkoutUrl` in a browser; the subscription applies when PayMongo confirms the payment.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;

    await connectDB();
    const profile = await MedicalRepresentative.findOne(repProfileFilter(rep)).select('firstName lastName email').lean<any>();
    if (!profile) return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });

    const checkout = await createRepSubscriptionCheckout(profile, parsed.data.billingCycle, parsed.data.plan);
    return NextResponse.json({ success: true, data: { checkoutUrl: checkout.checkoutUrl } });
  } catch (error) {
    if (error instanceof RepCheckoutError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Rep subscription checkout error:', error);
    return NextResponse.json({ success: false, error: 'Could not start the payment. Try again.' }, { status: 502 });
  }
}
