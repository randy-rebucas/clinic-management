// Role-Based Permissions System
// Defines what each role can do in the system

import { UserRole } from '@/models/User';

export interface Permission {
  resource: string;
  actions: string[];
}

// Default permissions for each role
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
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
  ],
  nurse: [
    { resource: 'patients', actions: ['read', 'write', 'update'] },
    { resource: 'visits', actions: ['read', 'write', 'update'] },
    { resource: 'prescriptions', actions: ['read'] },
    { resource: 'lab-results', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read', 'write', 'update'] },
    { resource: 'invoices', actions: ['read'] },
    { resource: 'doctors', actions: ['read'] },
  ],
  receptionist: [
    { resource: 'patients', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read', 'write', 'update', 'delete'] },
    { resource: 'visits', actions: ['read'] },
    { resource: 'invoices', actions: ['read', 'write', 'update'] },
    { resource: 'doctors', actions: ['read'] },
  ],
  accountant: [
    { resource: 'patients', actions: ['read'] },
    { resource: 'invoices', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ],
};

// Check if a role has permission for a resource and action
export function hasPermission(
  role: UserRole,
  resource: string,
  action: string,
  customPermissions?: Permission[]
): boolean {
  // Admin has full access
  if (role === 'admin') {
    return true;
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
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  for (const perm of rolePerms) {
    if (perm.resource === '*' || perm.resource === resource) {
      if (perm.actions.includes('*') || perm.actions.includes(action)) {
        return true;
      }
    }
  }

  return false;
}

// Get all permissions for a role
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

// Check if user can access a resource
export function canAccess(
  role: UserRole,
  resource: string,
  customPermissions?: Permission[]
): boolean {
  return hasPermission(role, resource, 'read', customPermissions);
}

// Check if user can modify a resource
export function canModify(
  role: UserRole,
  resource: string,
  customPermissions?: Permission[]
): boolean {
  return (
    hasPermission(role, resource, 'write', customPermissions) ||
    hasPermission(role, resource, 'update', customPermissions)
  );
}

// Check if user can delete a resource
export function canDelete(
  role: UserRole,
  resource: string,
  customPermissions?: Permission[]
): boolean {
  return hasPermission(role, resource, 'delete', customPermissions);
}

