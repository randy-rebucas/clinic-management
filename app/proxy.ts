import { NextRequest, NextResponse } from 'next/server';

const locales = ['en', 'es'];
const defaultLocale = 'en';
const defaultTenant = 'default'; // Default tenant slug

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';
  
  // Allow login page, forbidden page, error pages, and API routes to pass through
  // IMPORTANT: Check for forbidden BEFORE checking tenant/lang structure
  if (pathname === '/login' || pathname.includes('/forbidden') || pathname.includes('/error') || pathname.includes('/not-found') || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  // Check if path already has tenant and locale structure: /tenant/lang/...
  const pathParts = pathname.split('/').filter(Boolean);
  
  // If path starts with a tenant slug pattern (not a locale or known path)
  if (pathParts.length >= 2) {
    const firstPart = pathParts[0];
    const secondPart = pathParts[1];
    
    // Check if it's already in tenant/lang format
    if (locales.includes(secondPart)) {
      // Assume tenant exists if format is correct (will be validated in layout)
      return NextResponse.next(); // Already correctly formatted
    }
    
    // Check if second part is a special route (forbidden, error, not-found) that should pass through
    // This handles routes like /tenant/forbidden, /tenant/error, /tenant/not-found
    if (secondPart === 'forbidden' || secondPart === 'error' || secondPart === 'not-found') {
      return NextResponse.next(); // Let these routes pass through without adding locale
    }
  }
  
  // Try to get tenant from subdomain
  let tenantSlug = defaultTenant;
  const subdomain = host.split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'localhost' && subdomain !== '127.0.0.1') {
    // Use subdomain as tenant slug (will be validated in layout)
    tenantSlug = subdomain;
  }
  
  // Redirect to tenant/lang/pathname
  request.nextUrl.pathname = `/${tenantSlug}/${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    '/((?!_next|api|favicon.ico|.*\\..*).*)',
  ],
};
