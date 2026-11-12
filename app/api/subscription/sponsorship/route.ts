import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { loadClinicSponsorship, requestSponsorship } from '@/lib/clinic-sponsorship';
import { sponsorshipResponse } from '@/lib/api/sponsorship-response';

/**
 * GET /api/subscription/sponsorship
 * The clinic's open sponsorship (if any), earlier ones, the linked reps it can ask, and prices.
 */
export async function GET() {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!['admin', 'owner'].includes(ctx.session.role)) return refuseAccess(ctx.session, 'Forbidden', 'subscription', 'read');
    return NextResponse.json({ success: true, data: await loadClinicSponsorship(String(ctx.tenantId)) });
  } catch (error) {
    console.error('Load clinic sponsorship error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const requestSchema = z.object({
  repId: zObjectId,
  message: z.string().trim().max(500).optional(),
});

/**
 * POST /api/subscription/sponsorship  { repId, message? }
 * Ask a linked medical rep to pay for the clinic's subscription.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!['admin', 'owner'].includes(ctx.session.role)) return refuseAccess(ctx.session, 'Forbidden', 'subscription', 'write');
    const parsed = await parseBody(request, requestSchema);
    if (isValidationError(parsed)) return parsed;
    const r = await requestSponsorship({
      tenantId: String(ctx.tenantId),
      repId: parsed.data.repId,
      by: 'clinic',
      userId: ctx.session.userId,
      message: parsed.data.message,
    });
    return sponsorshipResponse(r, 201);
  } catch (error) {
    console.error('Request sponsorship error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
