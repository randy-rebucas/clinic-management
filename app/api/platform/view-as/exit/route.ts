import { NextRequest, NextResponse } from 'next/server';
import { verifySession, deleteSession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';

/**
 * GET /api/platform/view-as/exit  (on the clinic's subdomain)
 * Ends a view-as session and returns to the clinic's page in the platform console.
 * A GET because view-as sessions may not POST anything (proxy.ts).
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();
  const ctx = await getTenantContext();
  if (session?.imp) await deleteSession();

  const here = new URL(request.url);
  const rootHost = ctx.subdomain && here.host.startsWith(`${ctx.subdomain}.`) ? here.host.slice(ctx.subdomain.length + 1) : here.host;
  const target = new URL(session?.imp && session.tenantId ? `/platform/clinics/${session.tenantId}` : '/platform', `${here.protocol}//${rootHost}`);
  return NextResponse.redirect(target);
}
