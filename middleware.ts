import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * Multi-tenant middleware
 * Identifies tenant from:
 * 1. Subdomain (e.g., clinic1.example.com)
 * 2. Path prefix (e.g., /t/clinic1/...)
 * 3. X-Tenant-Slug header (for API calls)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip tenant resolution for static files and API routes that don't need tenant
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js)$/)
  ) {
    return NextResponse.next();
  }

  let tenantSlug: string | null = null;

  // Method 1: Check subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  // Skip if it's localhost or a known non-tenant subdomain
  if (subdomain && subdomain !== 'localhost' && subdomain !== 'www' && !hostname.includes('localhost')) {
    tenantSlug = subdomain;
  }

  // Method 2: Check path prefix (e.g., /t/clinic1/...)
  if (!tenantSlug) {
    const pathMatch = pathname.match(/^\/t\/([a-z0-9-]+)/);
    if (pathMatch) {
      tenantSlug = pathMatch[1];
    }
  }

  // Method 3: Check X-Tenant-Slug header (for API calls)
  if (!tenantSlug) {
    tenantSlug = request.headers.get('x-tenant-slug');
  }

  // If no tenant identified, try to get from session/cookie
  if (!tenantSlug) {
    const tenantCookie = request.cookies.get('tenant-slug');
    if (tenantCookie) {
      tenantSlug = tenantCookie.value;
    }
  }

  // If tenant slug found, verify it exists and set headers
  if (tenantSlug) {
    try {
      await connectDB();
      const tenant = await Tenant.findOne({ slug: tenantSlug, status: 'active' }).lean();
      
      if (tenant) {
        const response = NextResponse.next();
        
        // Set tenant headers for use in API routes and server components
        response.headers.set('x-tenant-id', tenant._id.toString());
        response.headers.set('x-tenant-slug', tenant.slug);
        response.headers.set('x-tenant-name', tenant.name);
        
        // Set cookie for client-side access
        response.cookies.set('tenant-slug', tenant.slug, {
          httpOnly: false, // Allow client-side access
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });
        
        // If using path-based routing, rewrite the URL to remove the tenant prefix
        if (pathname.startsWith(`/t/${tenantSlug}`)) {
          const newPathname = pathname.replace(`/t/${tenantSlug}`, '') || '/';
          const url = request.nextUrl.clone();
          url.pathname = newPathname;
          return NextResponse.rewrite(url);
        }
        
        return response;
      } else {
        // Tenant not found or inactive
        return new NextResponse('Tenant not found or inactive', { status: 404 });
      }
    } catch (error) {
      console.error('Error resolving tenant:', error);
      return NextResponse.next();
    }
  }

  // No tenant identified - allow request to proceed (for setup/login pages)
  // You may want to redirect to a tenant selection page or show an error
  return NextResponse.next();
}

// Configure which routes should run this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};

