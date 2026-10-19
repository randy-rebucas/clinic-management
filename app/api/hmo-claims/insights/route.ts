import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { hmoInsights } from '@/lib/hmo-claims';

/** GET: the claims page's figures: still to send, owed by payers by days since sent, and per payer. */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    return NextResponse.json({ success: true, data: await hmoInsights(ctx.tenantId) });
  } catch (error) {
    console.error('Error loading HMO claim figures:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the HMO claim figures' }, { status: 500 });
  }
}
