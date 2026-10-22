import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decodeJwt } from 'jose';
import { isAuthorizedCronRequest, safeEqual } from '@/lib/cron-auth';

/**
 * Next.js Proxy (proxy.ts — required name in Next.js 16.x)
 *
 * 1. CRON protection  — enforces Authorization: Bearer <CRON_SECRET> on all
 *    /api/cron/* routes. The x-vercel-cron header is NOT trusted (any client can send it);
 *    Vercel Cron sends the bearer secret automatically when CRON_SECRET is set.
 *
 * 2. Install protection — /api/install/* requires Authorization: Bearer <INSTALL_SECRET>
 *    in every environment, and is disabled when INSTALL_SECRET is not set.
 *
 * 3. CSRF protection — state-changing API requests that carry a session cookie
 *    must come from this site (Origin, or Referer when Origin is absent).
 *
 * 4. View-as is read-only — a staff session minted for a platform admin viewing a clinic
 *    (`imp` claim) may not make any state-changing request, API or server action.
 *
 * 5. Security headers — adds a per-request nonce CSP and additional headers to every response.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Server-to-server endpoints authenticated by their own signatures/secrets.
const CSRF_EXEMPT_PREFIXES = [
  '/api/paymongo/webhook',
  '/api/payments/webhook/',
  '/api/webhooks/',
  '/api/lab-results/third-party/webhook',
  '/api/cron/',
  '/api/csp-report',
];

function rootDomain(): string | null {
  const value = process.env.ROOT_DOMAIN?.split(':')[0].trim().toLowerCase();
  return value ? value.replace(/^\./, '') : null;
}

function hostnameOf(host: string): string {
  return host.split(':')[0].toLowerCase();
}

/** Same host, or both hosts are the configured root domain / one of its subdomains. */
function isTrustedSource(sourceHost: string, requestHost: string): boolean {
  if (sourceHost.toLowerCase() === requestHost.toLowerCase()) return true;
  const root = rootDomain();
  if (!root) return false;
  const inRoot = (h: string) => h === root || h.endsWith(`.${root}`);
  return inRoot(hostnameOf(sourceHost)) && inRoot(hostnameOf(requestHost));
}

/**
 * Clinic subdomains and Vercel preview deployments serve the same marketing pages as the main
 * site; keep them out of search so they don't compete with it as duplicate content.
 */
function isNonCanonicalHost(requestHost: string): boolean {
  const hostname = hostnameOf(requestHost);
  if (hostname.endsWith('.vercel.app')) return true;
  const root = rootDomain();
  return !!root && hostname.endsWith(`.${root}`) && hostname !== `www.${root}`;
}

function createNonce(): string {
  return btoa(crypto.randomUUID());
}

function buildCsp(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  // Next.js reads the nonce from the request's CSP header and stamps it on its own scripts;
  // 'strict-dynamic' lets those scripts load chunks. 'unsafe-eval' is only for the dev server.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProd ? [] : ["'unsafe-eval'"]),
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Inline style attributes (React style props, Tailwind runtime, chart libs) need this.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com https://static.vecteezy.com https://res.cloudinary.com",
    "font-src 'self' data:",
    `connect-src 'self'${isProd ? '' : ' ws: wss:'}`,
    // Turnstile (lib/turnstile.ts) renders its challenge in an iframe; its script is allowed by 'strict-dynamic'.
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ['upgrade-insecure-requests'] : []),
    'report-uri /api/csp-report',
  ].join('; ');
}

function addSecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  // Camera is needed on our own pages for QR scanning
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, host } = request.nextUrl;
  const method = request.method;
  const nonce = createNonce();
  const csp = buildCsp(nonce);

  const json = (status: number, error: string) =>
    addSecurityHeaders(NextResponse.json({ success: false, error }, { status }), csp);

  // Forward the nonce so pages (and HTML-rendering route handlers) can read it via x-nonce.
  const next = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);
    const response = addSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
    if (isNonCanonicalHost(request.headers.get('host') ?? host)) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return response;
  };

  // ─── 1. Cron route protection ─────────────────────────────────────────────
  if (pathname.startsWith('/api/cron/')) {
    if (!process.env.CRON_SECRET) {
      return json(503, 'Server misconfiguration: CRON_SECRET is not set');
    }
    if (!isAuthorizedCronRequest(request)) {
      return json(401, 'Unauthorized');
    }
    return next();
  }

  // ─── 2. Install route protection ──────────────────────────────────────────
  if (pathname.startsWith('/api/install/')) {
    const installSecret = process.env.INSTALL_SECRET;
    if (!installSecret) {
      return json(403, 'Install routes are disabled. Set INSTALL_SECRET to enable them.');
    }
    const authHeader = request.headers.get('authorization') ?? '';
    if (!safeEqual(authHeader, `Bearer ${installSecret}`)) {
      return json(401, 'Unauthorized');
    }
    return next();
  }

  // ─── 3. Sentry tunnel: only forward to our own Sentry project ─────────────
  // Sentry's tunnel rewrite forwards whatever o/p the caller sends, which would turn us into an
  // open relay for any Sentry project.
  if (pathname === '/monitoring' || pathname.startsWith('/monitoring/')) {
    const target = sentryTunnelTarget();
    if (!target) return json(404, 'Not found');
    const { searchParams } = request.nextUrl;
    if (searchParams.get('o') !== target.org || searchParams.get('p') !== target.project) {
      return json(400, 'Invalid Sentry target');
    }
    return next();
  }

  // ─── 4. View-as sessions are read-only ────────────────────────────────────
  if (!SAFE_METHODS.has(method) && isViewAsRequest(request)) {
    return json(403, 'Read-only: you are viewing this clinic from the platform console.');
  }

  // ─── 5. CSRF protection for state-changing API requests ───────────────────
  if (!SAFE_METHODS.has(method) && pathname.startsWith('/api/')) {
    const hasSession =
      request.cookies.has('session') ||
      request.cookies.has('patient_session') ||
      request.cookies.has('pending_2fa') ||
      request.cookies.has('platform_session');

    const csrfExempt = CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    if (hasSession && !csrfExempt) {
      const requestHost = request.headers.get('host') ?? host;
      const origin = request.headers.get('origin');
      const referer = request.headers.get('referer');
      const source = origin && origin !== 'null' ? origin : referer;

      if (!source) {
        return json(403, 'CSRF check failed');
      }

      let sourceHost: string;
      try {
        sourceHost = new URL(source).host;
      } catch {
        return json(403, 'Invalid origin');
      }

      if (!isTrustedSource(sourceHost, requestHost)) {
        return json(403, 'CSRF check failed');
      }
    }
  }

  // ─── 6. Add security headers to all responses ────────────────────────────
  return next();
}

/**
 * True when the staff session on this request (cookie or bearer) carries the view-as `imp`
 * claim. The token is only decoded here, not verified: the claim can only take rights away,
 * and the route itself still verifies the signature.
 */
function isViewAsRequest(request: NextRequest): boolean {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  for (const token of [request.cookies.get('session')?.value, bearer]) {
    if (!token) continue;
    try {
      if (typeof decodeJwt(token).imp === 'string') return true;
    } catch {
      // not a JWT; the route will reject it
    }
  }
  return false;
}

/** Org and project ids from the browser DSN (https://key@o<org>.ingest.sentry.io/<project>). */
function sentryTunnelTarget(): { org: string; project: string } | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const org = url.hostname.match(/^o(\d+)\./)?.[1];
    const project = url.pathname.replace(/^\/+|\/+$/g, '');
    return org && /^\d+$/.test(project) ? { org, project } : null;
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    '/api/cron/:path*',
    '/api/install/:path*',
    '/api/:path*',
    // Pages only; static files don't need a CSP or nonce (sw.js must not get the page CSP).
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|js|mjs|css|map|txt|xml|webmanifest|woff2?)$).*)',
  ],
};
