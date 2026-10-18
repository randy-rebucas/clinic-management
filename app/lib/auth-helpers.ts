import { NextRequest, NextResponse } from 'next/server';
import { cache } from 'react';
import { createHmac } from 'crypto';
import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import Permission from '@/models/Permission';
import { Types } from 'mongoose';
import { verifySession, verifySessionToken, deriveKey } from './dal';
import { safeEqual } from '@/lib/cron-auth';
import { BUILT_IN } from '@/lib/roles';

export interface JWTPayload {
  userId: string;
  tenantId?: string;
  email: string;
  role: string;
  roleId?: string;
  expiresAt?: number | Date;
}

/**
 * Verify a staff session token (signature, type, expiry, revocation and user status).
 * Socket tokens and patient tokens are rejected.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  return verifySessionToken(token);
}

export async function getCurrentUser(request: NextRequest): Promise<JWTPayload | null> {
  try {
    // Check for session cookie (primary) or auth-token cookie (legacy) or Authorization header
    const authHeader = request.headers.get('authorization') ?? '';
    const token = request.cookies.get('session')?.value ||
                  request.cookies.get('auth-token')?.value ||
                  (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');
    if (!token) {
      return null;
    }
    return await verifySessionToken(token);
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
    return session;
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
 * Access every role has regardless of its Permission documents. Lives in `lib/roles.ts` so
 * /admin/roles can show it as built in.
 */
const defaultRolePermissions = BUILT_IN;

type PermissionSubject = { userId?: string; role?: string; roleId?: string; tenantId?: string } | null;

/**
 * Load every Permission document granted to this user or role in one query.
 * Memoized per request, so many checks in one render cost a single round-trip.
 */
const loadGrantedPermissions = cache(async (userId: string, roleId: string, tenantId: string): Promise<Set<string>> => {
  const owners: Record<string, Types.ObjectId>[] = [];
  if (userId && Types.ObjectId.isValid(userId)) owners.push({ user: new Types.ObjectId(userId) });
  if (roleId && Types.ObjectId.isValid(roleId)) owners.push({ role: new Types.ObjectId(roleId) });
  if (owners.length === 0) return new Set();

  await connectDB();
  const tenantClause = tenantId && Types.ObjectId.isValid(tenantId)
    ? { tenantId: new Types.ObjectId(tenantId) }
    : { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };

  const docs = await Permission.find({ $and: [tenantClause, { $or: owners }] })
    .select('resource actions')
    .lean<{ resource: string; actions?: string[] }[]>();

  const granted = new Set<string>();
  for (const doc of docs) {
    for (const action of doc.actions || []) granted.add(`${doc.resource}:${action}`);
  }
  return granted;
});

/**
 * Build an in-memory permission checker for a session (one DB query in total).
 */
export async function getPermissionChecker(
  session: PermissionSubject
): Promise<(resource: string, action: string) => boolean> {
  if (!session) return () => false;
  if (session.role === 'admin' || session.role === 'owner') return () => true;

  const granted = await loadGrantedPermissions(session.userId || '', session.roleId || '', session.tenantId || '');
  const defaults = session.role ? defaultRolePermissions[session.role] : undefined;
  return (resource: string, action: string) =>
    granted.has(`${resource}:${action}`) || !!defaults?.[action]?.includes(resource);
}

/**
 * Check if user has permission (returns boolean)
 * Used for UI visibility checks
 */
export async function hasPermission(
  session: PermissionSubject,
  resource: string,
  action: string
): Promise<boolean> {
  try {
    const check = await getPermissionChecker(session);
    return check(resource, action);
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
  session: PermissionSubject,
  resource: string,
  action: string
): Promise<NextResponse | null> {
  if (!session) {
    return forbiddenResponse('No session provided');
  }

  try {
    const check = await getPermissionChecker(session);
    if (check(resource, action)) return null;
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

  let allowed = false;
  try {
    const check = await getPermissionChecker(session);
    allowed = check(resource, action);
  } catch (error) {
    console.error('Error checking page permission:', error);
    redirect('/dashboard?error=permission_error');
  }

  if (!allowed) {
    redirect('/dashboard?error=access_denied');
  }
}

/**
 * Token for a doctor's iCalendar feed URL. Keyed with a key derived from SESSION_SECRET
 * and bound to the linked user's sessionVersion, so revoking sessions also revokes feed links.
 */
export function calendarFeedToken(doctorId: string, sessionVersion = 0): string {
  return createHmac('sha256', deriveKey('calendar-feed'))
    .update(`${doctorId}:${sessionVersion}`)
    .digest('hex');
}

export function verifyCalendarFeedToken(doctorId: string, sessionVersion: number, token: string): boolean {
  return safeEqual(calendarFeedToken(doctorId, sessionVersion), token);
}
