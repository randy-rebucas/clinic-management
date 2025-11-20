import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup'];
  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'));

  // Static files and API routes are handled separately
  // API routes check authentication internally
  // Pages check authentication in their server components
  
  // For public routes, allow access
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For protected routes, authentication is checked in:
  // 1. Page server components (redirect to /login if not authenticated)
  // 2. API route handlers (return 401 if not authenticated)
  // This middleware allows the request to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
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

