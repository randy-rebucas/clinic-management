import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware for request-level security checks.
 *
 * This file was deleted from the repo at some point (git history: commit
 * 93693ba) and never replaced, silently dropping three protections that
 * were live in production before that. Restored here, ahead of the
 * MongoDB->PostgreSQL migration's Phase 6 (which adds tenant-context
 * wiring on top of this file), because the gaps were active security
 * issues independent of the migration:
 *
 * 1. Cron authentication: Vercel Cron sends `x-vercel-cron: 1`, but that
 *    header is client-settable and MUST NOT be trusted on its own — every
 *    /api/cron/* request is authenticated via the Authorization header
 *    against CRON_SECRET instead. (Each cron route also has its own
 *    fallback check; this is defense-in-depth, not the only layer.)
 * 2. Install-route lockdown: /api/install/* includes an unauthenticated
 *    "delete all data" reset endpoint (app/api/install/reset/route.ts).
 *    Blocked entirely in production unless INSTALL_SECRET is both
 *    configured and presented.
 * 3. CSRF protection: mutating requests (POST/PUT/PATCH/DELETE) that carry
 *    the `session` cookie must have an Origin header matching this app's
 *    own origin, so a third-party site can't ride an authenticated user's
 *    cookie to perform actions on their behalf.
 *
 * Static security headers (CSP, HSTS, X-Frame-Options, etc.) live in
 * next.config.ts and apply to all paths already — not duplicated here.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Cron endpoint protection ──────────────────────────────────────────
  if (pathname.startsWith('/api/cron/')) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret) {
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Cron endpoint not configured' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return NextResponse.next();
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return NextResponse.next();
  }

  // ── Install-route lockdown ──────────────────────────────────────────
  if (pathname.startsWith('/api/install/')) {
    const installSecret = process.env.INSTALL_SECRET;

    if (process.env.NODE_ENV === 'production') {
      if (!installSecret) {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Install endpoints are disabled' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const providedSecret =
        request.headers.get('x-install-secret') ||
        request.nextUrl.searchParams.get('installSecret');
      if (providedSecret !== installSecret) {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return NextResponse.next();
  }

  // ── CSRF protection for session-cookie-authenticated mutations ───────
  const method = request.method.toUpperCase();
  const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  if (pathname.startsWith('/api/') && isMutating && request.cookies.has('session')) {
    const origin = request.headers.get('origin');
    // Same-origin requests from fetch()/XHR always send Origin; a request
    // with no Origin header (e.g. a same-tab top-level navigation, or a
    // non-browser API client not carrying the cookie by choice) is not
    // the CSRF threat model this check targets, so it's allowed through —
    // only a mismatched Origin is rejected.
    if (origin) {
      const requestOrigin = request.nextUrl.origin;
      if (origin !== requestOrigin) {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Cross-origin request rejected' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
