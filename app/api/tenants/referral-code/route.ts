import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { lookupReferralCode, redeemReferralCode } from '@/lib/rep-referral';
import { createAuditLog } from '@/lib/audit';

/**
 * GET /api/tenants/referral-code?code=REP-7K2PQX  (public, rate-limited)
 * Checks a medical rep's referral code on the signup page and says whose it is.
 */
export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.referralLookup);
  if (limited) return limited;
  try {
    const found = await lookupReferralCode(request.nextUrl.searchParams.get('code'));
    if (!found.ok) return NextResponse.json({ success: false, error: found.error }, { status: 404 });
    return NextResponse.json({ success: true, data: { code: found.code, rep: found.rep } });
  } catch (error) {
    console.error('Referral code lookup error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const redeemSchema = z.object({ code: z.string().trim().min(1).max(40) });

/**
 * POST /api/tenants/referral-code  { code }  (clinic admin)
 * A clinic that's already registered enters a rep's code: the rep joins its representatives.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!['admin', 'owner'].includes(ctx.session.role)) {
      return refuseAccess(ctx.session, 'Forbidden', 'medical-representatives', 'write');
    }
    const limited = await applyRateLimit(request, rateLimiters.referralLookup);
    if (limited) return limited;
    const parsed = await parseBody(request, redeemSchema);
    if (isValidationError(parsed)) return parsed;

    const r = await redeemReferralCode(ctx.tenantObjectId, parsed.data.code);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    if (!r.alreadyLinked) {
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: String(ctx.tenantObjectId),
        action: 'update',
        resource: 'settings',
        description: `Linked medical rep ${r.rep.name} with a referral code`,
        metadata: { referralCode: true },
      }).catch(() => undefined);
    }
    return NextResponse.json({
      success: true,
      data: r,
      message: r.alreadyLinked ? `${r.rep.name} is already one of your reps.` : `${r.rep.name} is now one of your reps.`,
    });
  } catch (error) {
    console.error('Referral code redeem error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
