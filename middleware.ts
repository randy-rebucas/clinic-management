import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware for request-level security checks.
 *
 * Cron authentication:
 * - Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>` when
 *   CRON_SECRET is set in the environment.  Relying on `x-vercel-cron: 1` alone
 *   is insecure because any caller can spoof that header.  We therefore always
 *   validate the Authorization header for every /api/cron/* request.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Cron endpoint protection ──────────────────────────────────────────────
  if (pathname.startsWith('/api/cron/')) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization');

    if (!cronSecret) {
      // No CRON_SECRET configured — deny in production, allow in dev.
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Cron endpoint not configured' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Development: allow unauthenticated access (no secret set yet).
      return NextResponse.next();
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/cron/:path*',
};
