import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { endSponsorship, respondToSponsorship, type Actor } from '@/lib/clinic-sponsorship';
import { sponsorshipResponse } from '@/lib/api/sponsorship-response';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';

const schema = z.object({ action: z.enum(['accept', 'decline', 'cancel']) });

/**
 * PATCH /api/medical-representatives/sponsorships/[id]  { action }
 *  - accept / decline: a clinic's request to the rep.
 *  - cancel: withdraw a pending offer, or end an accepted sponsorship (no more payments; the
 *    clinic keeps the time already paid for).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;

    const actor: Actor = { side: 'rep', userId: rep.session.userId };
    const { action } = parsed.data;
    const r = action === 'cancel' ? await endSponsorship(id, actor) : await respondToSponsorship(id, actor, action);
    return sponsorshipResponse(r);
  } catch (error) {
    console.error('Update rep sponsorship error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
