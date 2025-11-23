// Role-Based Permissions System
// Defines what each role can do in the system

import connectDB from '@/lib/mongodb';
import Role, { RoleName } from '@/models/Role';
import Permission from '@/models/Permission';
import User from '@/models/User';
import { Types } from 'mongoose';

export interface PermissionData {
  resource: string;
  actions: string[];
}

// Default permissions for each role (used as fallback)
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, PermissionData[]> = {
  admin: [
    { resource: '*', actions: ['*'] }, // Full access to everything
  ],
  doctor: [
    { resource: 'patients', actions: ['read', 'write', 'update'] },
    { resource: 'visits', actions: ['read', 'write', 'update', 'delete'] },
    { resource: 'prescriptions', actions: ['read', 'write', 'update'] },
    { resource: 'lab-results', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read', 'write', 'update'] },
    { resource: 'invoices', actions: ['read'] },
    { resource: 'doctors', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
    { resource: 'queue', actions: ['read', 'write', 'update'] },
    { resource: 'referrals', actions: ['read', 'write', 'update'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
  nurse: [
    { resource: 'patients', actions: ['read', 'write', 'update'] },
    { resource: 'visits', actions: ['read', 'write', 'update'] },
    { resource: 'prescriptions', actions: ['read'] },
    { resource: 'lab-results', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read', 'write', 'update'] },
    { resource: 'invoices', actions: ['read'] },
    { resource: 'doctors', actions: ['read'] },
    { resource: 'queue', actions: ['read', 'write', 'update'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
  receptionist: [
    { resource: 'patients', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read', 'write', 'update', 'delete'] },
    { resource: 'visits', actions: ['read'] },
    { resource: 'invoices', actions: ['read', 'write', 'update'] },
    { resource: 'doctors', actions: ['read'] },
    { resource: 'queue', actions: ['read', 'write', 'update'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
  accountant: [
    { resource: 'patients', actions: ['read'] },
    { resource: 'invoices', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
};

/**
 * Get role name from role ID or role name
 */
async function getRoleName(roleIdOrName: string | Types.ObjectId | undefined | null): Promise<RoleName | null> {
  if (!roleIdOrName) return null;
  
  // If it's already a role name string, return it
  if (typeof roleIdOrName === 'string' && ['admin', 'doctor', 'nurse', 'receptionist', 'accountant'].includes(roleIdOrName)) {
    return roleIdOrName as RoleName;
  }
  
  try {
    await connectDB();
    const role = await Role.findById(roleIdOrName).select('name').lean();
    if (!role || Array.isArray(role)) return null;
    return (role as any).name as RoleName;
  } catch (error) {
    console.error('Error getting role name:', error);
    return null;
  }
}

/**
 * Get user's permissions from database (role permissions + custom permissions)
 */
export async function getUserPermissions(userId: string | Types.ObjectId): Promise<PermissionData[]> {
  try {
    await connectDB();
    
    // Get user with role and permissions
    const user = await User.findById(userId)
      .populate('role', 'name defaultPermissions permissions')
      .populate('permissions', 'resource actions')
      .lean();
    
    if (!user || Array.isArray(user)) {
      return [];
    }
    
    const permissions: PermissionData[] = [];
    const roleName = await getRoleName((user as any).role?._id || (user as any).role);
    
    // Get role-based permissions
    if ((user as any).role) {
      const role = (user as any).role;
      
      // Check if role has permissions array (populated)
      if (role.permissions && Array.isArray(role.permissions)) {
        for (const perm of role.permissions) {
          if (perm && typeof perm === 'object' && 'resource' in perm && 'actions' in perm) {
            permissions.push({
              resource: perm.resource,
              actions: Array.isArray(perm.actions) ? perm.actions : [],
            });
          }
        }
      }
      
      // Check defaultPermissions on role
      if (role.defaultPermissions && Array.isArray(role.defaultPermissions)) {
        for (const perm of role.defaultPermissions) {
          if (perm && typeof perm === 'object' && 'resource' in perm && 'actions' in perm) {
            permissions.push({
              resource: perm.resource,
              actions: Array.isArray(perm.actions) ? perm.actions : [],
            });
          }
        }
      }
      
      // Fallback to default permissions if role name is known
      if (roleName && permissions.length === 0) {
        return DEFAULT_ROLE_PERMISSIONS[roleName] || [];
      }
    }
    
    // Get custom user permissions
    if ((user as any).permissions && Array.isArray((user as any).permissions)) {
      for (const perm of (user as any).permissions) {
        if (perm && typeof perm === 'object' && 'resource' in perm && 'actions' in perm) {
          permissions.push({
            resource: perm.resource,
            actions: Array.isArray(perm.actions) ? perm.actions : [],
          });
        }
      }
    }
    
    // If no permissions found, use default for role
    if (permissions.length === 0 && roleName) {
      return DEFAULT_ROLE_PERMISSIONS[roleName] || [];
    }
    
    return permissions;
  } catch (error) {
    console.error('Error getting user permissions:', error);
    return [];
  }
}

/**
 * Check if user has permission for a resource and action
 */
export async function hasPermission(
  userId: string | Types.ObjectId,
  resource: string,
  action: string
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userId);
    
    for (const perm of permissions) {
      // Check if resource matches (wildcard or exact)
      if (perm.resource === '*' || perm.resource === resource) {
        // Check if action matches (wildcard or exact)
        if (perm.actions.includes('*') || perm.actions.includes(action)) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check if user has permission using role name (faster, uses defaults)
 */
export function hasPermissionByRole(
  roleName: RoleName | string | null | undefined,
  resource: string,
  action: string,
  customPermissions?: PermissionData[]
): boolean {
  // Admin has full access
  if (roleName === 'admin') {
    return true;
  }
  
  if (!roleName || !(roleName in DEFAULT_ROLE_PERMISSIONS)) {
    return false;
  }
  
  // Check custom permissions first (if provided)
  if (customPermissions) {
    for (const perm of customPermissions) {
      if (perm.resource === '*' || perm.resource === resource) {
        if (perm.actions.includes('*') || perm.actions.includes(action)) {
          return true;
        }
      }
    }
  }
  
  // Check default role permissions
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[roleName as RoleName] || [];
  for (const perm of rolePerms) {
    if (perm.resource === '*' || perm.resource === resource) {
      if (perm.actions.includes('*') || perm.actions.includes(action)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Get all permissions for a role (from defaults)
 */
export function getRolePermissions(roleName: RoleName): PermissionData[] {
  return DEFAULT_ROLE_PERMISSIONS[roleName] || [];
}

/**
 * Check if user can access a resource (read permission)
 */
export async function canAccess(
  userId: string | Types.ObjectId,
  resource: string
): Promise<boolean> {
  return hasPermission(userId, resource, 'read');
}

/**
 * Check if user can modify a resource (write or update permission)
 */
export async function canModify(
  userId: string | Types.ObjectId,
  resource: string
): Promise<boolean> {
  return (
    await hasPermission(userId, resource, 'write') ||
    await hasPermission(userId, resource, 'update')
  );
}

/**
 * Check if user can delete a resource
 */
export async function canDelete(
  userId: string | Types.ObjectId,
  resource: string
): Promise<boolean> {
  return hasPermission(userId, resource, 'delete');
}

/**
 * Check if user can access a resource by role (faster, uses defaults)
 */
export function canAccessByRole(
  roleName: RoleName | string | null | undefined,
  resource: string,
  customPermissions?: PermissionData[]
): boolean {
  return hasPermissionByRole(roleName, resource, 'read', customPermissions);
}

/**
 * Check if user can modify a resource by role (faster, uses defaults)
 */
export function canModifyByRole(
  roleName: RoleName | string | null | undefined,
  resource: string,
  customPermissions?: PermissionData[]
): boolean {
  return (
    hasPermissionByRole(roleName, resource, 'write', customPermissions) ||
    hasPermissionByRole(roleName, resource, 'update', customPermissions)
  );
}

/**
 * Check if user can delete a resource by role (faster, uses defaults)
 */
export function canDeleteByRole(
  roleName: RoleName | string | null | undefined,
  resource: string,
  customPermissions?: PermissionData[]
): boolean {
  return hasPermissionByRole(roleName, resource, 'delete', customPermissions);
}

