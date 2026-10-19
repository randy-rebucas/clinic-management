import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import ApiKey, { type ApiScope } from '@/models/ApiKey';
import Tenant from '@/models/Tenant';
import { hasFeature } from '@/lib/subscription-packages';
import { consumeRateLimit } from '@/lib/middleware/rate-limit';

/**
 * Public API keys. Format: `mcs_<keyId>_<secret>` — keyId is 12 hex characters (public, the
 * lookup), the secret 40 base62-ish characters. Only sha256(secret) is stored.
 */

const KEY_FORMAT = /^mcs_([a-f0-9]{12})_([A-Za-z0-9]{40})$/;
export const API_RATE_LIMIT = { name: 'public-api', windowMs: 60 * 1000, maxRequests: 120, identifierOnly: true };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function secretChars(n: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(n * 2);
  let out = '';
  for (let i = 0; out.length < n && i < bytes.length; i++) {
    // 248 = 62 * 4: drop bytes above it so every character is equally likely
    if (bytes[i] < 248) out += alphabet[bytes[i] % 62];
  }
  return out.length === n ? out : secretChars(n);
}

export function generateApiKey(): { key: string; keyId: string; secretHash: string; preview: string } {
  const keyId = randomBytes(6).toString('hex');
  const secret = secretChars(40);
  const key = `mcs_${keyId}_${secret}`;
  return { key, keyId, secretHash: sha256(secret), preview: `mcs_${keyId}_${secret.slice(0, 4)}…` };
}

export function parseApiKey(raw: string | null | undefined): { keyId: string; secret: string } | null {
  const m = raw?.trim().match(KEY_FORMAT);
  return m ? { keyId: m[1], secret: m[2] } : null;
}

export interface ApiContext {
  tenantId: string;
  tenantObjectId: Types.ObjectId;
  keyId: string;
  apiKeyId: string;
  scopes: ApiScope[];
}

export function apiError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

/** True when the clinic's plan includes the public API and its subscription is current. */
export async function tenantHasApiAccess(tenantId: string | Types.ObjectId, feature: 'apiAccess' | 'webhooks' = 'apiAccess'): Promise<boolean> {
  await connectDB();
  const t = await Tenant.findById(tenantId).select('status subscription.plan subscription.status subscription.expiresAt').lean<any>();
  if (!t || t.status !== 'active') return false;
  const sub = t.subscription ?? {};
  const current = sub.status !== 'expired' && sub.expiresAt && new Date(sub.expiresAt) > new Date();
  return !!current && hasFeature(sub.plan, feature);
}

/**
 * Authenticate a /api/v1 request by its API key (`Authorization: Bearer mcs_…`) and check
 * the scope, the clinic's plan and the per-key rate limit. Returns the context or an error
 * response the route returns as is.
 */
export async function requireApiKey(request: NextRequest, scope: ApiScope | null): Promise<ApiContext | NextResponse> {
  const header = request.headers.get('authorization') ?? '';
  const parsed = parseApiKey(header.replace(/^Bearer\s+/i, ''));
  if (!parsed) return apiError(401, 'unauthenticated', 'Send your API key as `Authorization: Bearer mcs_…`.');

  await connectDB();
  const key = await ApiKey.findOne({ keyId: parsed.keyId }).select('+secretHash tenantId scopes revokedAt lastUsedAt').lean<any>();
  const expected = Buffer.from(key?.secretHash ?? sha256('no-such-key'), 'hex');
  const given = Buffer.from(sha256(parsed.secret), 'hex');
  if (!key || !timingSafeEqual(expected, given) || key.revokedAt) {
    return apiError(401, 'unauthenticated', 'This API key is invalid or has been revoked.');
  }

  const limit = await consumeRateLimit(API_RATE_LIMIT, 'api', parsed.keyId);
  const rateHeaders = {
    'X-RateLimit-Limit': String(limit.limit),
    'X-RateLimit-Remaining': String(Math.max(0, limit.limit - limit.count)),
  };
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', `Too many requests. Limit is ${limit.limit} a minute per key.`, {
      ...rateHeaders,
      'Retry-After': String(limit.retryAfter),
    });
  }

  if (scope && !(key.scopes as string[]).includes(scope)) {
    return apiError(403, 'insufficient_scope', `This key does not have the \`${scope}\` scope.`);
  }
  if (!(await tenantHasApiAccess(key.tenantId))) {
    return apiError(403, 'plan_required', 'API access needs an active Professional or Enterprise plan.');
  }

  // At most one write a minute per key
  if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 60_000) {
    void ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});
  }

  return {
    tenantId: String(key.tenantId),
    tenantObjectId: new Types.ObjectId(String(key.tenantId)),
    keyId: parsed.keyId,
    apiKeyId: String(key._id),
    scopes: key.scopes,
  };
}

export function isApiError(value: ApiContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Parse and validate a JSON body; a 400 in the public API's error shape when it doesn't fit. */
export async function parseApiBody<T extends z.ZodType>(request: NextRequest, schema: T): Promise<{ data: z.infer<T> } | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, 'invalid_json', 'The request body must be JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'Invalid body',
          details: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
      },
      { status: 400 }
    );
  }
  return { data: result.data };
}

/** Page through results: `?limit=` (1–100, default 25) and an opaque `?cursor=` from the last page. */
export function pageParams(request: NextRequest): { limit: number; after: Types.ObjectId | null } | NextResponse {
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 25));
  const cursor = sp.get('cursor');
  if (cursor && !Types.ObjectId.isValid(cursor)) return apiError(400, 'invalid_cursor', 'The cursor is not valid.');
  return { limit, after: cursor ? new Types.ObjectId(cursor) : null };
}

/** `{ data, has_more, next_cursor }` from a query that fetched limit + 1 rows sorted by _id desc. */
export function pageOf<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, has_more: hasMore, next_cursor: hasMore ? data[data.length - 1].id : null };
}
