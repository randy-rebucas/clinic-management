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
  const session = await requireAuth();
  
  // Check session role first (fast check)
  if (session.role === 'admin') {
    console.log('✅ Admin access granted via session role');
    return session;
  }
  
  // If session role is not admin, double-check against database
  // This handles cases where user role was updated but session wasn't refreshed
  try {
    await connectDB();
    
    // Register models to ensure they're available
    const { registerAllModels } = await import('@/models');
    registerAllModels();
    
    const User = (await import('@/models/User')).default;
    const Role = (await import('@/models/Role')).default;
    
    // Get user with populated role
    const user = await User.findById(session.userId)
      .populate('role', 'name')
      .lean();
    
    if (!user) {
      console.log('❌ User not found in database');
      redirect('/dashboard');
    }
    
    // Extract role name from various possible formats
    let roleName: string | null = null;
    
    if ((user as any).role) {
      const role = (user as any).role;
      
      // Case 1: Role is populated object with name property
      if (typeof role === 'object' && role !== null && 'name' in role) {
        roleName = role.name;
      }
      // Case 2: Role is a string (legacy or direct assignment)
      else if (typeof role === 'string') {
        roleName = role;
      }
      // Case 3: Role is an ObjectId - need to look it up
      else if (role && typeof role.toString === 'function') {
        try {
          const roleDoc = await Role.findById(role).select('name').lean();
          if (roleDoc && !Array.isArray(roleDoc)) {
            roleName = (roleDoc as any).name;
          }
        } catch (lookupError) {
          console.error('Error looking up role by ID:', lookupError);
        }
      }
    }
    
    console.log('🔍 Role check - session.role:', session.role, 'database roleName:', roleName);
    
    // Check if role name is 'admin'
    if (roleName === 'admin') {
      console.log('✅ Admin access granted via database role check');
      return session;
    }
    
    // Fallback: Use getUser() which has more robust role handling
    const { getUser } = await import('@/app/lib/dal');
    const userFromGetUser = await getUser();
    
    if (userFromGetUser && userFromGetUser.role === 'admin') {
      console.log('✅ Admin access granted via getUser() fallback');
      return session;
    }
    
    console.log('❌ User is not admin - session.role:', session.role, 'userFromGetUser.role:', userFromGetUser?.role);
  } catch (error) {
    console.error('❌ Error checking user role in requireAdmin:', error);
    // Don't redirect on error - let it fall through to show the error
  }
  
  // Not admin - redirect to dashboard
  console.log('❌ User is not admin - redirecting to dashboard');
  redirect('/dashboard');
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

