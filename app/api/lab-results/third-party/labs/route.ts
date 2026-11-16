import { NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/auth-helpers';
import { listConfiguredLabs } from '@/lib/lab-integration';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';

/**
 * GET /api/lab-results/third-party/labs: the partner labs this clinic can send orders to
 * (LAB_INTEGRATIONS entries open to it). Names and codes only; endpoints and keys never leave the server.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'lab-results', 'update');
  if (permissionCheck) return permissionCheck;
  return NextResponse.json({ success: true, data: listConfiguredLabs(ctx.tenantId) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
