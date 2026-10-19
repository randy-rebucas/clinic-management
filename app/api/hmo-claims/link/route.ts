import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, zShortText } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { linkUnlistedClaims } from '@/lib/hmo-claims';

const schema = z.object({ provider: zShortText.min(1), hmo: zObjectId });

/**
 * POST { provider, hmo }: claims still to send whose payer was typed on the invoice as `provider`
 * (and isn't on the HMO list) are billed to that HMO instead, so they can be sent.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const parsed = await parseBody(request, schema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const r = await linkUnlistedClaims(ctx.tenantId, parsed.data.provider, parsed.data.hmo);
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    if (r.linked > 0) {
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'hmo',
        resourceId: parsed.data.hmo,
        description: `Billed ${r.linked} unsent claims typed as “${parsed.data.provider}” to this HMO`,
      });
    }
    return NextResponse.json({ success: true, data: { linked: r.linked } });
  } catch (error) {
    console.error('Error linking HMO claims:', error);
    return NextResponse.json({ success: false, error: 'Failed to link the claims' }, { status: 500 });
  }
}
