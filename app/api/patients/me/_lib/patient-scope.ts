import { NextResponse } from 'next/server';
import { Types } from 'mongoose';

/**
 * Query-input and clinic-scope helpers shared by the patient `/api/patients/me/*` routes and the
 * patient booking routes (`/api/patients/appointments`). Pure functions: no DB access.
 */

type SessionLike = { tid?: string | null } | null | undefined;

/**
 * The clinic a patient session is bound to, when it is bound to one (a token signed in through a
 * clinic carries `tid`). Undefined for clinic-agnostic sessions.
 */
export function sessionTenantId(session: SessionLike): string | undefined {
  const tid: unknown = session?.tid;
  return typeof tid === 'string' && Types.ObjectId.isValid(tid) ? tid : undefined;
}

/**
 * The clinics this session may see records of: the patient's clinics, narrowed to the session's
 * clinic when the session carries one. Values are the patient's own stored ids (ObjectIds in
 * production), so they drop straight into a Mongo filter.
 *
 * Returns `null` when nothing restricts the query (a legacy patient with no clinic list and a
 * clinic-agnostic session). An empty array means "no clinic in scope": match nothing.
 */
export function scopedTenantIds(patientTenantIds: unknown[] | null | undefined, session: SessionLike): unknown[] | null {
  const ids = patientTenantIds ?? [];
  const tid = sessionTenantId(session);
  if (!tid) return ids.length > 0 ? ids : null;
  if (ids.length === 0) return [new Types.ObjectId(tid)];
  return ids.filter((id) => String(id) === tid);
}

/**
 * Strict variant for writes (booking, cancelling): only clinics the patient is registered at,
 * narrowed to the session's clinic when it carries one. Never unrestricted; may be empty.
 */
export function memberTenantIds(patientTenantIds: unknown[] | null | undefined, session: SessionLike): unknown[] {
  const ids = patientTenantIds ?? [];
  const tid = sessionTenantId(session);
  return tid ? ids.filter((id) => String(id) === tid) : ids;
}

/** `{ tenantId: { $in } }` for the session's clinic scope, or `{}` when unrestricted. */
export function tenantScopeFilter(patientTenantIds: unknown[] | null | undefined, session: SessionLike): Record<string, unknown> {
  const scope = scopedTenantIds(patientTenantIds, session);
  return scope === null ? {} : { tenantId: { $in: scope } };
}

export type TenantFilterResult =
  | { ok: true; filter: Record<string, unknown>; scope: unknown[] | null }
  | { ok: false; response: NextResponse };

/**
 * Tenant filter for a list route, honouring an optional `tenantId` query param:
 * - malformed `tenantId` → 400
 * - `tenantId` outside the session's clinic scope → 403 (never silently widened or emptied)
 * - otherwise the param narrows the scope to that clinic; without it the whole scope applies.
 */
export function resolveTenantFilter(
  patientTenantIds: unknown[] | null | undefined,
  session: SessionLike,
  requested: string | null | undefined
): TenantFilterResult {
  const scope = scopedTenantIds(patientTenantIds, session);
  const param = requested?.trim();
  if (!param) {
    return { ok: true, filter: scope === null ? {} : { tenantId: { $in: scope } }, scope };
  }
  if (!Types.ObjectId.isValid(param) || !/^[0-9a-fA-F]{24}$/.test(param)) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Invalid tenantId.' }, { status: 400 }) };
  }
  if (scope === null) {
    return { ok: true, filter: { tenantId: new Types.ObjectId(param) }, scope: [new Types.ObjectId(param)] };
  }
  const match = scope.find((id) => String(id) === param);
  if (match === undefined) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Not available for this clinic.' }, { status: 403 }),
    };
  }
  return { ok: true, filter: { tenantId: match }, scope: [match] };
}

const MAX_PAGE = 10_000;

/** A positive integer from a query value, or `fallback` when it is missing or not a number. */
function positiveInt(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/**
 * `page` / `limit` from the query string, clamped: never NaN, page in [1, 10000], limit in
 * [1, maxLimit] (a non-numeric limit falls back to the route's default).
 */
export function parsePagination(
  searchParams: URLSearchParams,
  { defaultLimit, maxLimit }: { defaultLimit: number; maxLimit: number }
): { page: number; limit: number; skip: number } {
  const page = Math.min(MAX_PAGE, positiveInt(searchParams.get('page'), 1));
  const limit = Math.min(maxLimit, positiveInt(searchParams.get('limit'), defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
