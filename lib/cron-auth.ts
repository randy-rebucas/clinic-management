import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Verify a scheduled-job request.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
 * is set, so the bearer token is always required. The `x-vercel-cron` header is NOT
 * trusted: any client can send it.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Returns a 401 response when the request is not an authorized cron call, otherwise null. */
export function requireCron(request: Request): NextResponse | null {
  if (isAuthorizedCronRequest(request)) return null;
  return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
}

/** Constant-time string comparison for secrets and tokens. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
