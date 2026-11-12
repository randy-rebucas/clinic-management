import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createSponsorshipCheckout } from '@/lib/clinic-sponsorship';
import { sponsorshipResponse } from '@/lib/api/sponsorship-response';
import { requireRepSession, isRepSessionError } from '../../../_lib/rep-session';

const schema = z.object({ months: z.number().int() });

/**
 * POST /api/medical-representatives/sponsorships/[id]/checkout  { months: 1 | 3 | 6 | 12 }
 * A PayMongo checkout for that many months of the clinic's Professional plan. Open `checkoutUrl`
 * in a browser; the clinic's plan is extended when PayMongo confirms the payment. Paying again
 * later renews it, from the end of the time already paid for.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    return sponsorshipResponse(await createSponsorshipCheckout(id, rep.session.userId, parsed.data.months));
  } catch (error) {
    console.error('Sponsorship checkout error:', error);
    return NextResponse.json({ success: false, error: 'Could not start the payment. Nothing was charged; try again.' }, { status: 502 });
  }
}
