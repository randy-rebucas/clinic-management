import 'server-only';
import { NextResponse } from 'next/server';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, type TenantSession } from '@/lib/api/tenant-session';
import { tenantHasApiAccess } from '@/lib/api-keys';

/**
 * The clinic admin managing API keys and webhooks. With `feature`, the clinic's plan must
 * include it (creating keys or endpoints); listing and revoking work on any plan, so a
 * clinic that downgrades can still clean up.
 */
export async function requireDeveloperAdmin(feature?: 'apiAccess' | 'webhooks'): Promise<TenantSession | NextResponse> {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Only clinic administrators can manage API keys and webhooks', 'administration', 'write');
  if (feature && !(await tenantHasApiAccess(ctx.tenantId, feature))) {
    return NextResponse.json(
      { success: false, error: `${feature === 'apiAccess' ? 'API access' : 'Webhooks'} need an active Professional or Enterprise plan.` },
      { status: 403 }
    );
  }
  return ctx;
}
