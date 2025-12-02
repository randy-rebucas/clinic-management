import { verifySession } from './dal';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

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
export async function requireRole(allowedRoles: ('admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative')[]) {
  const session = await requireAuth();
  
  if (!allowedRoles.includes(session.role)) {
    redirect('/dashboard');
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
 * Require permission for a page - redirects if not authorized
 * @param resource - Resource name (e.g., 'patients', 'appointments')
 * @param action - Action name (e.g., 'read', 'write', 'delete')
 * @returns SessionPayload if authenticated and authorized
 */
export async function requirePagePermission(resource: string, action: string = 'read') {
  const session = await requireAuth();
  
  const hasPerm = await hasPermission(session, resource, action);
  if (!hasPerm) {
    redirect('/dashboard'); // Redirect to home if no permission
  }
  
  return session;
}

/**
 * Check if user has required role (for API routes)
 * @param session - Current session
 * @param allowedRoles - Array of roles that are allowed
 * @returns true if user has required role
 */
export function hasRole(
  session: { role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative' } | null,
  allowedRoles: ('admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative')[]
): boolean {
  if (!session) return false;
  return allowedRoles.includes(session.role);
}

/**
 * Check if user is admin (for API routes)
 * @param session - Current session
 * @returns true if user is admin
 */
export function isAdmin(session: { role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative' } | null): boolean {
  return hasRole(session, ['admin']);
}

/**
 * Check if user has permission for a resource and action
 * @param session - Current session
 * @param resource - Resource name (e.g., 'patients', 'appointments')
 * @param action - Action name (e.g., 'read', 'write', 'delete')
 * @returns true if user has permission
 */
export async function hasPermission(
  session: { role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative'; userId: string; roleId?: string } | null,
  resource: string,
  action: string
): Promise<boolean> {
  if (!session) return false;
  
  // Import permissions utility
  const { hasPermission: checkPermission, hasPermissionByRole } = await import('@/lib/permissions');
  
  // Use faster role-based check first (uses defaults)
  if (hasPermissionByRole(session.role, resource, action)) {
    return true;
  }
  
  // If role-based check fails, do full database check (for custom permissions)
  return await checkPermission(session.userId, resource, action);
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

/**
 * Require permission for API routes - returns forbidden response if not authorized
 * @param session - Current session
 * @param resource - Resource name (e.g., 'patients', 'appointments')
 * @param action - Action name (e.g., 'read', 'write', 'update', 'delete')
 * @returns null if authorized, forbidden response if not
 */
export async function requirePermission(
  session: { role: 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative'; userId: string; roleId?: string } | null,
  resource: string,
  action: string
): Promise<NextResponse | null> {
  if (!session) {
    return unauthorizedResponse();
  }
  
  const hasPerm = await hasPermission(session, resource, action);
  if (!hasPerm) {
    return forbiddenResponse(`You don't have permission to ${action} ${resource}`);
  }
  
  return null;
}

