import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { OPEN_CLAIMS_LIMIT, listDrafts, listOpenClaims } from '@/lib/hmo-claims';

/**
 * GET: claims billed to a payer and not yet sent (oldest first, at most OPEN_CLAIMS_LIMIT), and
 * the drafts they can be added to. Billing staff (invoices:write).
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const [claims, drafts] = await Promise.all([listOpenClaims(ctx.tenantId), listDrafts(ctx.tenantId)]);
    return NextResponse.json({ success: true, data: { claims, drafts, limited: claims.length >= OPEN_CLAIMS_LIMIT } });
  } catch (error) {
    console.error('Error loading HMO claims to send:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the claims to send' }, { status: 500 });
  }
}
