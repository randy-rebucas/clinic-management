import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createTeamCheckout, RepCheckoutError } from '@/lib/rep-billing';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { requireTeamManager, isTeamError, teamError } from '../../_lib/rep-team';

const schema = z.object({
  seats: z.number().int().min(1).max(500),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
});

/**
 * POST /api/medical-representatives/team/checkout  { seats, billingCycle? }
 * A PayMongo checkout for the team plan (manager). Seats must cover every current member. The
 * period starts when the one already paid for ends; the seat count applies from payment.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const ctx = await requireTeamManager(rep);
    if (isTeamError(ctx)) return ctx;

    const members = await MedicalRepresentative.countDocuments({ teamId: ctx.team._id });
    if (parsed.data.seats < members) {
      return teamError(400, `The team has ${members} members; buy at least ${members} seats.`, 'TOO_FEW_SEATS');
    }
    const checkout = await createTeamCheckout(ctx.team, parsed.data.seats, parsed.data.billingCycle, ctx.me.email);
    return NextResponse.json({ success: true, data: { checkoutUrl: checkout.checkoutUrl } });
  } catch (error) {
    if (error instanceof RepCheckoutError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    console.error('Rep team checkout error:', error);
    return NextResponse.json({ success: false, error: 'Could not start the payment. Try again.' }, { status: 502 });
  }
}
