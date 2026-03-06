import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Proxy
 *
 * 1. CRON protection  — enforces Authorization: Bearer <CRON_SECRET> on all
 *    /api/cron/* routes.  The x-vercel-cron header is NOT trusted; it is
 *    trivially spoofable by any external client.
 *
 * 2. Install protection — blocks /api/install/* in production unless the
 *    caller supplies Authorization: Bearer <INSTALL_SECRET>.
 *
 * 3. CSRF protection — state-changing API requests that carry a session
 *    cookie must originate from an allowed origin.  Requests that come in
 *    without a session cookie (public endpoints, cron, webhooks) are exempt.
 *
 * 4. Security headers — adds CSP and additional headers to every response.
 */

// Origins allowed to make credentialed (cookie-bearing) requests.
// Derived from ROOT_DOMAIN at boot time so it works in Edge without fs.
function getAllowedOrigins(): string[] {
  const rootDomain = process.env.ROOT_DOMAIN;
  if (!rootDomain) return [];
  return [
    `https://${rootDomain}`,
    `https://www.${rootDomain}`,
  ];
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Content-Security-Policy — restrictive baseline; adjust if you use CDNs / inline scripts
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
  const { pathname } = request.nextUrl;

  // ─── 1. Cron route protection ─────────────────────────────────────────────
  if (pathname.startsWith('/api/cron/')) {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { success: false, error: 'Server misconfiguration: CRON_SECRET is not set' },
          { status: 503 }
        );
      }
      // Development: allow through without a secret
      return NextResponse.next();
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.next();
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
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    return NextResponse.next();
  }

  // ─── 3. CSRF protection for state-changing API requests ───────────────────
  // Only apply to mutating API methods that carry a session cookie.
  const isApiMutation =
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

  const hasSessionCookie =
    request.cookies.has('session') || request.cookies.has('patient_session');

  // Exempt: public webhooks and auth endpoints don't carry a session cookie
  const csrfExempt =
    pathname.startsWith('/api/subscription/webhook') ||
    pathname.startsWith('/api/lab-results/third-party/webhook') ||
    pathname.startsWith('/api/tenants/onboard') ||
    pathname.startsWith('/api/medical-representatives/login') ||
    pathname.startsWith('/api/patients/qr-login');

  if (isApiMutation && hasSessionCookie && !csrfExempt) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host') || '';

    if (origin) {
      const allowedOrigins = getAllowedOrigins();

      // Allow same-origin requests (origin host matches request host)
      const originHost = new URL(origin).host;
      const isSameHost = originHost === host || originHost.endsWith(`.${host}`);

      // Allow configured origins (e.g. www.myclinicsoft.com, *.myclinicsoft.com)
      const isAllowedOrigin =
        isSameHost ||
        allowedOrigins.some(
          (allowed) =>
            origin === allowed || origin.endsWith(allowed.replace('https://', '.'))
        );

      if (!isAllowedOrigin) {
        return NextResponse.json(
          { success: false, error: 'CSRF check failed: origin not allowed' },
          { status: 403 }
        );
      }
    }
    // If no Origin header — allow (server-to-server calls, same-origin fetch without CORS)
  }

  // ─── 4. Continue and add security headers ─────────────────────────────────
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
