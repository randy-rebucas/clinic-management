/**
 * API Rate Limiting
 *
 * Counters live in Upstash Redis (REST API, plain fetch) when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set, so limits hold across serverless instances. Otherwise,
 * or when Redis is unreachable, an in-memory fixed window is used (per instance only).
 *
 * Clients are keyed by a trusted IP (never the client-supplied leftmost X-Forwarded-For).
 * Callers can pass an extra identifier (email, phone, user id) to apply per-account limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { redisPipeline } from '@/lib/redis';

interface RateLimitConfig {
  /** Namespace for the counter; limiters with different names never share counts. */
  name: string;
  windowMs: number;
  maxRequests: number;
  message?: string;
  /** When true, the IP is left out of the key (identifier-only limit, e.g. per phone number). */
  identifierOnly?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetTime: number;
  retryAfter: number;
}

type Limiter = ((request: NextRequest, identifier?: string) => Promise<NextResponse | null>) & {
  config: RateLimitConfig;
};

const memoryStore = new Map<string, { count: number; resetTime: number }>();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetTime < now) memoryStore.delete(key);
  }
}, 5 * 60 * 1000);
// Don't keep the process alive just for cleanup
(cleanup as unknown as { unref?: () => void }).unref?.();

/**
 * Best-effort client IP that a client cannot choose freely.
 * On Vercel the platform sets x-vercel-forwarded-for / x-real-ip. Elsewhere we take the
 * RIGHTMOST X-Forwarded-For entry, which is the one appended by our own proxy.
 */
export function getClientIp(headers: Headers): string {
  if (process.env.VERCEL) {
    const vercelIp = headers.get('x-vercel-forwarded-for') || headers.get('x-real-ip');
    if (vercelIp) return vercelIp.split(',')[0].trim();
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier.toLowerCase().trim()).digest('hex').slice(0, 32);
}

function buildKey(config: RateLimitConfig, ip: string, identifier?: string): string {
  const parts = ['rl', config.name];
  if (!config.identifierOnly || !identifier) parts.push(ip);
  if (identifier) parts.push(hashIdentifier(identifier));
  return parts.join(':');
}

function hitMemory(key: string, windowMs: number): { count: number; resetTime: number } {
  const now = Date.now();
  let entry = memoryStore.get(key);
  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + windowMs };
    memoryStore.set(key, entry);
  }
  entry.count++;
  return { count: entry.count, resetTime: entry.resetTime };
}

async function hit(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
  const results = await redisPipeline([
    ['INCR', key],
    ['PEXPIRE', key, windowMs, 'NX'],
    ['PTTL', key],
  ]);
  if (results && typeof results[0]?.result === 'number') {
    const count = results[0].result as number;
    const ttl = typeof results[2]?.result === 'number' && (results[2].result as number) > 0
      ? (results[2].result as number)
      : windowMs;
    return { count, resetTime: Date.now() + ttl };
  }
  return hitMemory(key, windowMs);
}

/** Count one attempt against `config` for (ip, identifier) and report whether it is allowed. */
export async function consumeRateLimit(
  config: RateLimitConfig,
  ip: string,
  identifier?: string
): Promise<RateLimitResult> {
  const { count, resetTime } = await hit(buildKey(config, ip, identifier), config.windowMs);
  return {
    allowed: count <= config.maxRequests,
    count,
    limit: config.maxRequests,
    resetTime,
    retryAfter: Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)),
  };
}

/** Clear the counter for (ip, identifier), e.g. after a successful login. */
export async function resetRateLimit(config: RateLimitConfig, ip: string, identifier?: string): Promise<void> {
  const key = buildKey(config, ip, identifier);
  memoryStore.delete(key);
  await redisPipeline([['DEL', key]]);
}

function tooManyRequests(config: RateLimitConfig, result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: config.message || 'Too many requests, please try again later',
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': result.retryAfter.toString(),
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      },
    }
  );
}

/**
 * Create a limiter. Calling it returns a 429 NextResponse when the limit is exceeded,
 * otherwise null.
 */
export function rateLimit(config: RateLimitConfig): Limiter {
  const limiter = (async (request: NextRequest, identifier?: string) => {
    const result = await consumeRateLimit(config, getClientIp(request.headers), identifier);
    return result.allowed ? null : tooManyRequests(config, result);
  }) as Limiter;
  limiter.config = config;
  return limiter;
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const rateLimiters = {
  // Strict per-IP limit for authentication endpoints
  auth: rateLimit({
    name: 'auth',
    windowMs: 15 * 60 * 1000,
    maxRequests: 10,
    message: 'Too many authentication attempts, please try again later',
  }),

  // Per (account + IP): failed credential attempts for one account from one client
  authAccount: rateLimit({
    name: 'auth-account',
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many attempts for this account, please try again later',
  }),

  // Per account across all IPs: bounds distributed guessing without letting a single
  // client lock the real user out quickly
  authAccountGlobal: rateLimit({
    name: 'auth-account-global',
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
    identifierOnly: true,
    message: 'Too many attempts for this account, please try again later',
  }),

  // OTP delivery per destination (SMS bombing protection)
  otpSend: rateLimit({
    name: 'otp-send',
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    identifierOnly: true,
    message: 'Too many codes requested, please try again later',
  }),

  // eMCR "is this your record?" answers per account per day (5 per 15 min comes from authAccount)
  emcrClaimDaily: rateLimit({
    name: 'emcr-claim-daily',
    windowMs: 24 * 60 * 60 * 1000,
    maxRequests: 10,
    identifierOnly: true,
    message: 'Too many tries today. Please try again tomorrow or ask your clinic for help.',
  }),

  // eMCR voucher codes per account (wrong codes are guesses)
  voucherRedeem: rateLimit({
    name: 'voucher-redeem',
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
    identifierOnly: true,
    message: 'Too many codes tried. Please check the voucher and try again later.',
  }),

  // Standard API rate limit
  api: rateLimit({
    name: 'api',
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: 'API rate limit exceeded, please slow down',
  }),

  // Strict rate limit for public endpoints
  public: rateLimit({
    name: 'public',
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Rate limit exceeded, please try again later',
  }),

  // Unauthenticated writes that create records and send SMS (online booking, self-registration)
  publicWrite: rateLimit({
    name: 'public-write',
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many requests from this device. Please try again later or contact the clinic.',
  }),

  // Same writes per destination phone across all IPs (SMS pumping / slot squatting)
  publicWritePhone: rateLimit({
    name: 'public-write-phone',
    windowMs: 24 * 60 * 60 * 1000,
    maxRequests: 3,
    identifierOnly: true,
    message: 'Too many requests for this phone number today. Please contact the clinic.',
  }),

  // Lenient rate limit for authenticated users
  authenticated: rateLimit({
    name: 'authenticated',
    windowMs: 60 * 1000,
    maxRequests: 200,
    message: 'Rate limit exceeded, please slow down',
  }),
};

/**
 * Helper to apply rate limiting in API routes.
 * Pass `identifier` (email, phone, user id) to scope the limit to an account as well.
 */
export async function applyRateLimit(
  request: NextRequest,
  limiter: (req: NextRequest, identifier?: string) => Promise<NextResponse | null>,
  identifier?: string
): Promise<NextResponse | null> {
  return limiter(request, identifier);
}

/**
 * Apply the per-IP auth limit plus per-account limits for a credential attempt.
 * Returns a 429 response or null.
 */
export async function applyAuthRateLimits(
  request: NextRequest,
  account: string | null | undefined
): Promise<NextResponse | null> {
  const ipLimited = await rateLimiters.auth(request);
  if (ipLimited) return ipLimited;
  if (!account) return null;
  return (
    (await rateLimiters.authAccount(request, account)) ||
    (await rateLimiters.authAccountGlobal(request, account))
  );
}
