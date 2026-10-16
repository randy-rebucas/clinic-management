import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifySession, type SessionPayload } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';

export type TenantSession = {
  session: SessionPayload;
  tenantId: string;
  tenantObjectId: Types.ObjectId;
};

/**
 * Authenticate the request and resolve the tenant the caller belongs to.
 *
 * The tenant always comes from the signed session, never from the request body or
 * query. When the request arrives on a tenant subdomain, it must match the session's
 * tenant, so a cookie shared across subdomains cannot be replayed against another clinic.
 *
 * Returns a NextResponse (401/403) on failure; callers should `return` it.
 */
export async function requireTenantSession(): Promise<TenantSession | NextResponse> {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) {
    return NextResponse.json({ success: false, error: 'No clinic associated with this account' }, { status: 403 });
  }

  const ctx = await getTenantContext();
  if (ctx.tenantId && ctx.tenantId !== session.tenantId) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  return {
    session,
    tenantId: session.tenantId,
    tenantObjectId: new Types.ObjectId(session.tenantId),
  };
}

export function isTenantSessionError(value: TenantSession | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Filter for models with a single `tenantId` field. */
export function tenantFilter(tenantId: string | Types.ObjectId, extra: Record<string, unknown> = {}) {
  return { ...extra, tenantId: new Types.ObjectId(String(tenantId)) };
}

/** Filter for the Patient model, which belongs to many tenants via `tenantIds`. */
export function patientTenantFilter(tenantId: string | Types.ObjectId, extra: Record<string, unknown> = {}) {
  return { ...extra, tenantIds: new Types.ObjectId(String(tenantId)) };
}

/** True when `id` is a valid ObjectId string. Use before querying by route params. */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && Types.ObjectId.isValid(id);
}

export function notFound(what = 'Resource') {
  return NextResponse.json({ success: false, error: `${what} not found` }, { status: 404 });
}
