import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Proxy (proxy.ts — required name in Next.js 16.x Turbopack)
 *
 * 1. CRON protection  — enforces Authorization: Bearer <CRON_SECRET> on all
 *    /api/cron/* routes. Vercel's x-vercel-cron: 1 header is also accepted.
 *
 * 2. Install protection — blocks /api/install/* in production unless the
 *    caller supplies Authorization: Bearer <INSTALL_SECRET>.
 *
 * 3. CSRF protection — state-changing API requests that carry a session
 *    cookie must originate from an allowed origin.
 *
 * 4. Security headers — adds CSP and additional headers to every response.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Return the apex domain (e.g. "tenant.clinic.com" → "clinic.com"). */
function apexDomain(hostname: string): string {
  const parts = hostname.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.paypalobjects.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com https://static.vecteezy.com https://res.cloudinary.com",
    "font-src 'self'",
    "connect-src 'self' https://api.paypal.com https://www.paypal.com",
    "frame-src 'self' https://www.paypal.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, host } = request.nextUrl;
  const method = request.method;

  // ─── 1. Cron route protection ─────────────────────────────────────────────
  if (pathname.startsWith('/api/cron/')) {
    const cronSecret = process.env.CRON_SECRET;
    // Vercel's infrastructure stamps this; external callers cannot forge it on Vercel platform.
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const authHeader = request.headers.get('authorization');

    if (cronSecret) {
      if (!isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Server misconfiguration: CRON_SECRET is not set' },
        { status: 503 }
      );
    }

    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ─── 2. Install route protection ──────────────────────────────────────────
  if (pathname.startsWith('/api/install/')) {
    if (process.env.NODE_ENV === 'production') {
      const installSecret = process.env.INSTALL_SECRET;

      if (!installSecret) {
        return NextResponse.json(
          { success: false, error: 'Install routes are disabled in production' },
          { status: 403 }
        );
      }

      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${installSecret}`) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // ─── 3. CSRF protection for state-changing API requests ───────────────────
  if (!SAFE_METHODS.has(method) && pathname.startsWith('/api/')) {
    const hasSession =
      request.cookies.has('session') || request.cookies.has('patient_session');

    // Exempt: public webhooks, auth endpoints, and booking flows don't carry a session cookie
    const csrfExempt =
      pathname.startsWith('/api/subscription/webhook') ||
      pathname.startsWith('/api/lab-results/third-party/webhook') ||
      pathname.startsWith('/api/webhooks/twilio') ||
      pathname.startsWith('/api/feedback/') ||
      pathname.startsWith('/api/tenants/onboard') ||
      pathname.startsWith('/api/medical-representatives/login') ||
      pathname.startsWith('/api/patients/qr-login');

    if (hasSession && !csrfExempt) {
      const origin = request.headers.get('origin');
      if (origin) {
        let originHost: string;
        try {
          originHost = new URL(origin).host;
        } catch {
          return NextResponse.json({ success: false, error: 'Invalid origin' }, { status: 403 });
        }

        const requestHost = request.headers.get('host') ?? host;

        // Allow same host or same apex domain (e.g. tenant.clinic.com ↔ app.clinic.com)
        const isSameHost = originHost === requestHost;
        const isSameApex =
          apexDomain(originHost) === apexDomain(requestHost) &&
          apexDomain(requestHost) !== requestHost; // only if it's actually a subdomain

        if (!isSameHost && !isSameApex) {
          return NextResponse.json({ success: false, error: 'CSRF check failed' }, { status: 403 });
        }
      }
      // No Origin header → same-origin or non-browser caller — allow.
    }
  }

  // ─── 4. Add security headers to all responses ────────────────────────────
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    '/api/cron/:path*',
    '/api/install/:path*',
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
