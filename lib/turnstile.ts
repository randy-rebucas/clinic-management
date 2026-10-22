import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/middleware/rate-limit';

/**
 * Cloudflare Turnstile check for unauthenticated forms that create records or send SMS
 * (online booking, patient self-registration). Off until TURNSTILE_SECRET_KEY is set, together
 * with NEXT_PUBLIC_TURNSTILE_SITE_KEY for the widget; once on, a missing or failed token is refused.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return false;
  }
}

/** A 403 response when the token doesn't verify, otherwise null. */
export async function turnstileRejection(request: NextRequest, token: unknown): Promise<NextResponse | null> {
  if (await verifyTurnstile(token, getClientIp(request.headers))) return null;
  return NextResponse.json(
    { success: false, error: 'Please complete the security check and try again.' },
    { status: 403 }
  );
}
