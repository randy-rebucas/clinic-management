import { type NextRequest, NextResponse } from 'next/server';
import { extractSubdomain, getRootDomain, verifyTenant } from '@/lib/tenant';
import { requiresSubscriptionRedirect } from '@/lib/subscription';

/**
 * Proxy middleware for multi-tenant support and security headers
 * Extracts subdomain from request, sets tenant context, and adds security headers
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);
  const rootDomain = getRootDomain();

  // Allow access to API routes, static files, and Next.js internals
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot)$/)
  ) {
    const response = NextResponse.next();
    addSecurityHeaders(request, response);
    return response;
  }

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup', '/onboard', '/book', '/patient/login', '/tenant-onboard', '/subscription', '/tenant-not-found'];
  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));

  // If no subdomain, allow normal access (root domain)
  if (!subdomain) {
    // Block access to tenant-specific routes on root domain (except tenant-onboard)
    if (pathname.startsWith('/tenant') && !pathname.startsWith('/tenant-onboard')) {
      const response = NextResponse.redirect(new URL('/', request.url));
      addSecurityHeaders(request, response);
      return response;
    }
    
    // For public routes and protected routes, authentication is checked in:
    // 1. Page server components (redirect to /login if not authenticated)
    // 2. API route handlers (return 401 if not authenticated)
    const response = NextResponse.next();
    addSecurityHeaders(request, response);
    return response;
  }

  // If subdomain exists, verify tenant and handle routing
  const tenant = await verifyTenant(subdomain);
  
  if (!tenant) {
    // Tenant not found or inactive - redirect to tenant-not-found page
    // Only redirect to tenant-not-found if not already on that page
    if (!pathname.startsWith('/tenant-not-found')) {
      const response = NextResponse.redirect(new URL('/tenant-not-found', request.url));
      addSecurityHeaders(request, response);
      return response;
    }
    // If already on tenant-not-found page, allow it to render
    const response = NextResponse.next();
    addSecurityHeaders(request, response);
    return response;
  }

  // Check subscription status and redirect to subscription page if expired
  // Allow access to subscription page, login, and public routes
  const subscriptionRoutes = ['/subscription', '/login', '/signup', '/tenant-onboard', '/tenant-not-found'];
  const isSubscriptionRoute = subscriptionRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));

  if (!isSubscriptionRoute && !isPublicRoute) {
    const needsRedirect = await requiresSubscriptionRedirect(tenant._id);
    if (needsRedirect) {
      const response = NextResponse.redirect(new URL('/subscription', request.url));
      addSecurityHeaders(request, response);
      return response;
    }
  }

  // Block access to admin routes from subdomains (these should be on root domain only)
  if (pathname.startsWith('/admin')) {
    const response = NextResponse.redirect(new URL('/', request.url));
    addSecurityHeaders(request, response);
    return response;
  }

  // Add tenant subdomain to headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-subdomain', subdomain);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  addSecurityHeaders(request, response);
  return response;
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(request: NextRequest, response: NextResponse) {
  // Security headers - apply in all environments for consistency
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // DNS prefetch control
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  
  // Permissions policy
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy (adjust as needed for your app)
  if (process.env.NODE_ENV === 'production') {
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
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

