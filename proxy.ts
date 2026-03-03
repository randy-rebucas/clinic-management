import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Cron endpoint protection ──────────────────────────────────────────────
  // Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`.
  // Relying on `x-vercel-cron: 1` alone is insecure; always validate the
  // Authorization header for every /api/cron/* request.
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
      // Development: allow unauthenticated access (no secret set yet).
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

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup', '/setup'];
  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));

  // Static files and API routes are handled separately
  // API routes check authentication internally
  // Pages check authentication in their server components
  
  // For public routes, allow access
  if (isPublicRoute) {
    const response = NextResponse.next();
    addSecurityHeaders(request, response);
    return response;
  }

  // For protected routes, authentication is checked in:
  // 1. Page server components (redirect to /login if not authenticated)
  // 2. API route handlers (return 401 if not authenticated)
  // This proxy allows the request to proceed
  const response = NextResponse.next();
  addSecurityHeaders(request, response);
  return response;
}

function addSecurityHeaders(request: NextRequest, response: NextResponse) {
  // Security headers for production
  if (process.env.NODE_ENV === 'production') {
    // Prevent clickjacking
    response.headers.set('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    response.headers.set('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content Security Policy (adjust as needed for your app)
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // 'unsafe-eval' and 'unsafe-inline' needed for Next.js
      "style-src 'self' 'unsafe-inline'", // 'unsafe-inline' needed for Tailwind
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join('; ');
    response.headers.set('Content-Security-Policy', csp);
    
    // Strict Transport Security (HSTS) - only if using HTTPS
    if (request.nextUrl.protocol === 'https:') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  }
}

export const config = {
  matcher: [
    // Cron endpoints always require auth validation
    '/api/cron/:path*',
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
