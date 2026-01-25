import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function getCurrentUser(request: NextRequest): Promise<JWTPayload | null> {
  try {
    const token = request.cookies.get('auth-token')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return null;
    }
    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }
    await connectDB();
    const user = await User.findById(payload.userId).select('isActive tenantId').lean<{ isActive: boolean; tenantId: string } | null>();
    if (!user || !user.isActive || user.tenantId.toString() !== payload.tenantId) {
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


export async function requireAdmin(request: NextRequest): Promise<JWTPayload> {
  const user = await requireAuth(request);
  if (user.role !== 'admin') {
    throw new Error('Forbidden: Admins only');
  }
  return user;
}

// Permission helpers would need to be adapted for JWT context if needed


