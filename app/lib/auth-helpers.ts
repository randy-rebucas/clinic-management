import { verifySession } from './dal';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

/**
 * Require authentication - redirects to login if not authenticated
 * @returns SessionPayload if authenticated
 */
export async function requireAuth() {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

/**
 * Require specific role(s) - redirects to login if not authenticated or doesn't have required role
 * @param allowedRoles - Array of roles that are allowed
 * @returns SessionPayload if authenticated and authorized
 */
export async function requireRole(allowedRoles: ('admin' | 'user' | 'doctor')[]) {
  const session = await requireAuth();
  
  if (!allowedRoles.includes(session.role)) {
    redirect('/');
  }
  
  return session;
}

/**
 * Require admin role
 * @returns SessionPayload if authenticated and is admin
 */
export async function requireAdmin() {
  return requireRole(['admin']);
}

/**
 * Check if user has required role (for API routes)
 * @param session - Current session
 * @param allowedRoles - Array of roles that are allowed
 * @returns true if user has required role
 */
export function hasRole(
  session: { role: 'admin' | 'user' | 'doctor' } | null,
  allowedRoles: ('admin' | 'user' | 'doctor')[]
): boolean {
  if (!session) return false;
  return allowedRoles.includes(session.role);
}

/**
 * Check if user is admin (for API routes)
 * @param session - Current session
 * @returns true if user is admin
 */
export function isAdmin(session: { role: 'admin' | 'user' | 'doctor' } | null): boolean {
  return hasRole(session, ['admin']);
}

/**
 * Create unauthorized response for API routes
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

/**
 * Create forbidden response for API routes (authenticated but not authorized)
 */
export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}

