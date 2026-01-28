import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import Permission from '@/models/Permission';
import { Types } from 'mongoose';
import { verifySession } from './dal';

export interface JWTPayload {
  userId: string;
  tenantId?: string;
  email: string;
  role: string;
  roleId?: string;
  expiresAt?: number | Date;
}

// Use the same secret as dal.ts for consistency
const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(
  secretKey || 'default-secret-key-change-in-production-dev-only'
);

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ['HS256'],
    });

    // Validate required fields
    if (
      typeof payload !== 'object' ||
      !payload ||
      typeof (payload as any).userId !== 'string' ||
      typeof (payload as any).email !== 'string' ||
      typeof (payload as any).role !== 'string'
    ) {
      return null;
    }

    return payload as unknown as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function getCurrentUser(request: NextRequest): Promise<JWTPayload | null> {
  try {
    // Check for session cookie (primary) or auth-token cookie (legacy) or Authorization header
    const token = request.cookies.get('session')?.value ||
                  request.cookies.get('auth-token')?.value ||
                  request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return null;
    }
    const payload = await verifyToken(token);
    if (!payload) {
      return null;
    }
    await connectDB();
    const user = await User.findById(payload.userId).select('isActive status tenantId').lean<{ isActive?: boolean; status?: string; tenantId?: string } | null>();

    // Check if user exists and is active
    if (!user) {
      return null;
    }

    // Check user is active (support both isActive boolean and status string)
    const isUserActive = user.isActive !== false && user.status !== 'inactive';
    if (!isUserActive) {
      return null;
    }

    // For multi-tenant, verify tenant matches if both have tenantId
    if (payload.tenantId && user.tenantId && user.tenantId.toString() !== payload.tenantId) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}


export function hasRole(userRole: string, requiredRoles: string[]): boolean {
  const roleHierarchy: Record<string, number> = {
    viewer: 1,
    cashier: 2,
    manager: 3,
    admin: 4,
    owner: 5,
    doctor: 3,
    nurse: 2,
    receptionist: 1,
    accountant: 2,
    'medical-representative': 1,
  };
  const userLevel = roleHierarchy[userRole] || 0;
  return requiredRoles.some(role => roleHierarchy[role] <= userLevel);
}

export async function requireAuth(request: NextRequest): Promise<JWTPayload> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function requireRole(request: NextRequest, roles: string[]): Promise<JWTPayload> {
  const user = await requireAuth(request);
  if (!hasRole(user.role, roles)) {
    throw new Error('Forbidden: Insufficient permissions');
  }
  return user;
}


/**
 * Require admin role - works for both API routes (with request) and server components (without request)
 */
export async function requireAdmin(request?: NextRequest): Promise<JWTPayload | void> {
  // Server component path (no request)
  if (!request) {
    const session = await verifySession();
    if (!session) {
      redirect('/login');
    }
    if (session.role !== 'admin' && session.role !== 'owner') {
      redirect('/dashboard?error=admin_required');
    }
    return;
  }

  // API route path (with request)
  const user = await requireAuth(request);
  if (user.role !== 'admin' && user.role !== 'owner') {
    throw new Error('Forbidden: Admins only');
  }
  return user;
}

// Permission helpers

/**
 * Check if user has admin role
 */
export function isAdmin(session: { role?: string } | null): boolean {
  if (!session || !session.role) return false;
  return session.role === 'admin' || session.role === 'owner';
}

/**
 * Default permissions by role - centralized for reuse
 */
const defaultRolePermissions: Record<string, Record<string, string[]>> = {
  doctor: {
    read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals', 'reports', 'medicines', 'services', 'rooms'],
    write: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals'],
    delete: ['prescriptions'],
  },
  nurse: {
    read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'queue', 'medicines', 'rooms'],
    write: ['patients', 'visits', 'queue', 'lab-results'],
    delete: [],
  },
  receptionist: {
    read: ['patients', 'appointments', 'queue', 'invoices', 'visits', 'doctors', 'services', 'rooms'],
    write: ['patients', 'appointments', 'queue', 'invoices'],
    delete: [],
  },
  accountant: {
    read: ['patients', 'invoices', 'reports', 'visits'],
    write: ['invoices'],
    delete: [],
  },
  'medical-representative': {
    read: ['doctors', 'appointments'],
    write: [],
    delete: [],
  },
};

/**
 * Check if user has permission (returns boolean)
 * Used for UI visibility checks
 */
export async function hasPermission(
  session: { userId?: string; role?: string; roleId?: string; tenantId?: string } | null,
  resource: string,
  action: string
): Promise<boolean> {
  if (!session) {
    return false;
  }

  // Admins and owners have full access
  if (session.role === 'admin' || session.role === 'owner') {
    return true;
  }

  try {
    await connectDB();

    // Build query for permissions
    const permissionQuery: any = {
      resource,
      actions: action,
    };

    // Add tenant filter if available
    if (session.tenantId) {
      permissionQuery.tenantId = new Types.ObjectId(session.tenantId);
    } else {
      permissionQuery.$or = [
        { tenantId: { $exists: false } },
        { tenantId: null }
      ];
    }

    // Check user-specific permission
    if (session.userId) {
      const userPermission = await Permission.findOne({
        ...permissionQuery,
        user: new Types.ObjectId(session.userId),
      }).lean();

      if (userPermission) {
        return true;
      }
    }

    // Check role-based permission
    if (session.roleId) {
      const rolePermission = await Permission.findOne({
        ...permissionQuery,
        role: new Types.ObjectId(session.roleId),
      }).lean();

      if (rolePermission) {
        return true;
      }
    }

    // Check default role permissions
    if (session.role && defaultRolePermissions[session.role]) {
      const rolePerms = defaultRolePermissions[session.role];
      if (rolePerms[action]?.includes(resource)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check if user has permission to perform action on resource
 * Returns null if allowed, or a 403 response if forbidden
 */
export async function requirePermission(
  session: { userId?: string; role?: string; roleId?: string; tenantId?: string } | null,
  resource: string,
  action: string
): Promise<NextResponse | null> {
  if (!session) {
    return forbiddenResponse('No session provided');
  }

  // Admins and owners have full access
  if (session.role === 'admin' || session.role === 'owner') {
    return null;
  }

  try {
    await connectDB();

    // Build query for permissions - check both user-specific and role-based
    const permissionQuery: any = {
      resource,
      actions: action,
    };

    // Add tenant filter if available
    if (session.tenantId) {
      permissionQuery.tenantId = new Types.ObjectId(session.tenantId);
    } else {
      permissionQuery.$or = [
        { tenantId: { $exists: false } },
        { tenantId: null }
      ];
    }

    // Check user-specific permission first
    if (session.userId) {
      const userPermission = await Permission.findOne({
        ...permissionQuery,
        user: new Types.ObjectId(session.userId),
      }).lean();

      if (userPermission) {
        return null; // Permission granted
      }
    }

    // Check role-based permission
    if (session.roleId) {
      const rolePermission = await Permission.findOne({
        ...permissionQuery,
        role: new Types.ObjectId(session.roleId),
      }).lean();

      if (rolePermission) {
        return null; // Permission granted
      }
    }

    // Default permissions based on role for common operations
    const defaultPermissions: Record<string, Record<string, string[]>> = {
      doctor: {
        read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals', 'reports', 'medicines', 'services', 'rooms'],
        write: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals'],
        delete: ['prescriptions'],
      },
      nurse: {
        read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'queue', 'medicines', 'rooms'],
        write: ['patients', 'visits', 'queue', 'lab-results'],
        delete: [],
      },
      receptionist: {
        read: ['patients', 'appointments', 'queue', 'invoices', 'visits', 'doctors', 'services', 'rooms'],
        write: ['patients', 'appointments', 'queue', 'invoices'],
        delete: [],
      },
      accountant: {
        read: ['patients', 'invoices', 'reports', 'visits'],
        write: ['invoices'],
        delete: [],
      },
      'medical-representative': {
        read: ['doctors', 'appointments'],
        write: [],
        delete: [],
      },
    };

    // Check default role permissions
    if (session.role && defaultPermissions[session.role]) {
      const rolePerms = defaultPermissions[session.role];
      if (rolePerms[action]?.includes(resource)) {
        return null; // Permission granted via default role permissions
      }
    }

    return forbiddenResponse(`Permission denied: Cannot ${action} ${resource}`);
  } catch (error) {
    console.error('Error checking permission:', error);
    // In case of error, deny access
    return forbiddenResponse('Error checking permissions');
  }
}

/**
 * Create an unauthorized JSON response
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 401 }
  );
}

/**
 * Create a forbidden JSON response
 */
export function forbiddenResponse(message: string = 'Forbidden') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}

/**
 * Server Component/Page permission check
 * Redirects to login if no session, or to dashboard with error if no permission
 */
export async function requirePagePermission(
  resource: string,
  action: string
): Promise<void> {
  const session = await verifySession();

  if (!session) {
    redirect('/login');
  }

  // Admins and owners have full access
  if (session.role === 'admin' || session.role === 'owner') {
    return;
  }

  try {
    await connectDB();

    // Build query for permissions
    const permissionQuery: any = {
      resource,
      actions: action,
    };

    // Add tenant filter if available
    if (session.tenantId) {
      permissionQuery.tenantId = new Types.ObjectId(session.tenantId);
    } else {
      permissionQuery.$or = [
        { tenantId: { $exists: false } },
        { tenantId: null }
      ];
    }

    // Check user-specific permission
    if (session.userId) {
      const userPermission = await Permission.findOne({
        ...permissionQuery,
        user: new Types.ObjectId(session.userId),
      }).lean();

      if (userPermission) {
        return; // Permission granted
      }
    }

    // Check role-based permission
    if (session.roleId) {
      const rolePermission = await Permission.findOne({
        ...permissionQuery,
        role: new Types.ObjectId(session.roleId),
      }).lean();

      if (rolePermission) {
        return; // Permission granted
      }
    }

    // Default permissions based on role
    const defaultPermissions: Record<string, Record<string, string[]>> = {
      doctor: {
        read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals', 'reports', 'medicines', 'services', 'rooms'],
        write: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'documents', 'queue', 'referrals'],
        delete: ['prescriptions'],
      },
      nurse: {
        read: ['patients', 'visits', 'appointments', 'prescriptions', 'lab-results', 'queue', 'medicines', 'rooms'],
        write: ['patients', 'visits', 'queue', 'lab-results'],
        delete: [],
      },
      receptionist: {
        read: ['patients', 'appointments', 'queue', 'invoices', 'visits', 'doctors', 'services', 'rooms'],
        write: ['patients', 'appointments', 'queue', 'invoices'],
        delete: [],
      },
      accountant: {
        read: ['patients', 'invoices', 'reports', 'visits'],
        write: ['invoices'],
        delete: [],
      },
      'medical-representative': {
        read: ['doctors', 'appointments'],
        write: [],
        delete: [],
      },
    };

    // Check default role permissions
    if (session.role && defaultPermissions[session.role]) {
      const rolePerms = defaultPermissions[session.role];
      if (rolePerms[action]?.includes(resource)) {
        return; // Permission granted
      }
    }

    // No permission - redirect to dashboard
    redirect('/dashboard?error=access_denied');
  } catch (error) {
    console.error('Error checking page permission:', error);
    redirect('/dashboard?error=permission_error');
  }
}


