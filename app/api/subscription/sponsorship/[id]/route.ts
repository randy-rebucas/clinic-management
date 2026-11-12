import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { endSponsorship, respondToSponsorship, type Actor } from '@/lib/clinic-sponsorship';
import { sponsorshipResponse } from '@/lib/api/sponsorship-response';

const schema = z.object({ action: z.enum(['accept', 'decline', 'cancel']) });

/**
 * PATCH /api/subscription/sponsorship/[id]  { action }
 *  - accept / decline: a rep's offer to sponsor the clinic.
 *  - cancel: withdraw a pending request, or end an accepted sponsorship (the plan keeps the time
 *    already paid for).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!['admin', 'owner'].includes(ctx.session.role)) return refuseAccess(ctx.session, 'Forbidden', 'subscription', 'write');
    const { id } = await params;
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;

    const actor: Actor = { side: 'clinic', tenantId: String(ctx.tenantId), userId: ctx.session.userId };
    const { action } = parsed.data;
    const r = action === 'cancel' ? await endSponsorship(id, actor) : await respondToSponsorship(id, actor, action);
    return sponsorshipResponse(r);
  } catch (error) {
    console.error('Update clinic sponsorship error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
