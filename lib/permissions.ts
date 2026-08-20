// Role-Based Permissions System
// Defines what each role can do in the system

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getRoleById, roleNameToAppRole } from '@/lib/data/role';
import { getUserById } from '@/lib/data/user';
import { listPermissions } from '@/lib/data/permission';

// RoleName kept as the local string-union type this module has always used
// (Prisma's RoleName enum is the DB-level source of truth; see
// prisma/schema.prisma — 'owner' is a pre-existing gap not addressed here).
export type RoleName = 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';

export interface PermissionData {
  resource: string;
  actions: string[];
}

// Default permissions for each role (used as fallback)
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleName, PermissionData[]> = {
  admin: [
    { resource: '*', actions: ['*'] }, // Full access to everything (tenant-scoped at API level)
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
    { resource: 'documents', actions: ['read', 'write', 'update'] },
    { resource: 'inventory', actions: ['read'] },
    { resource: 'medicines', actions: ['read', 'write', 'update'] },
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
    { resource: 'documents', actions: ['read', 'write', 'update'] },
    { resource: 'inventory', actions: ['read'] },
    { resource: 'medicines', actions: ['read', 'write', 'update'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
  receptionist: [
    { resource: 'patients', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read', 'write', 'update', 'delete'] },
    { resource: 'visits', actions: ['read'] },
    { resource: 'invoices', actions: ['read', 'write', 'update'] },
    { resource: 'doctors', actions: ['read'] },
    { resource: 'queue', actions: ['read', 'write', 'update'] },
    { resource: 'documents', actions: ['read', 'write', 'update'] },
    { resource: 'inventory', actions: ['read', 'write', 'update'] },
    { resource: 'medicines', actions: ['read'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
  accountant: [
    { resource: 'patients', actions: ['read'] },
    { resource: 'invoices', actions: ['read', 'write', 'update'] },
    { resource: 'appointments', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
    { resource: 'documents', actions: ['read'] },
    { resource: 'inventory', actions: ['read', 'write', 'update'] },
    { resource: 'medicines', actions: ['read'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
  'medical-representative': [
    { resource: 'doctors', actions: ['read'] },
    { resource: 'patients', actions: ['read'] },
    { resource: 'appointments', actions: ['read'] },
    { resource: 'medicines', actions: ['read'] },
    { resource: 'notifications', actions: ['read', 'update'] },
  ],
};

/**
 * Get role name from role ID or role name
 * @param roleIdOrName Role ID or role name
 * @param tenantId Optional tenant ID for tenant-scoped role lookup
 */
async function getRoleName(roleIdOrName: string | undefined | null, tenantId?: string | null): Promise<RoleName | null> {
  if (!roleIdOrName) return null;

  // If it's already a role name string, return it
  if (['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'].includes(roleIdOrName)) {
    return roleIdOrName as RoleName;
  }

  try {
    // Explicit tenant branch: real tenantId -> runWithTenant (auto-scoped);
    // no tenantId (legacy no-subdomain mode) -> runAsSystem, unscoped
    // lookup across all tenants + untenanted roles.
    const role = tenantId
      ? await runWithTenant(tenantId, () => getRoleById(roleIdOrName))
      : await runAsSystem(() => getRoleById(roleIdOrName));
    if (!role) return null;
    return roleNameToAppRole(role.name) as RoleName;
  } catch (error) {
    console.error('Error getting role name:', error);
    return null;
  }
}

/**
 * Get user's permissions from database (role permissions + custom permissions)
 * @param userId User ID
 * @param tenantId Optional tenant ID for tenant-scoped permission lookup
 */
export async function getUserPermissions(userId: string, tenantId?: string | null): Promise<PermissionData[]> {
  try {
    // Explicit tenant branch: real tenantId -> runWithTenant (auto-scoped
    // User/Role/Permission queries); no tenantId (legacy no-subdomain mode)
    // -> runAsSystem, unscoped lookup across all tenants + untenanted rows
    // (closest Postgres equivalent of the old Mongoose
    // `$or: [{tenantId:{$exists:false}}, {tenantId:null}]`).
    const load = async () => {
      const user = await getUserById(userId, { withRole: true });
      if (!user) return null;

      const roleWithDefaults = user.roleId ? await getRoleById(user.roleId, { withDefaultPermissions: true }) : null;
      const customPermissions = await listPermissions({ userId });

      return { user, roleWithDefaults, customPermissions };
    };

    const result = tenantId ? await runWithTenant(tenantId, load) : await runAsSystem(load);
    if (!result) return [];

    const { user, roleWithDefaults, customPermissions } = result;
    const permissions: PermissionData[] = [];
    const roleName = await getRoleName(user.roleId, tenantId);

    // Get role-based permissions
    if (roleWithDefaults) {
      for (const perm of roleWithDefaults.permissions) {
        permissions.push({ resource: perm.resource, actions: perm.actions });
      }
      for (const perm of roleWithDefaults.defaultPermissions) {
        permissions.push({ resource: perm.resource, actions: perm.actions });
      }

      // Fallback to default permissions if role name is known
      if (roleName && permissions.length === 0) {
        return DEFAULT_ROLE_PERMISSIONS[roleName] || [];
      }
    }

    // Get custom user permissions
    for (const perm of customPermissions) {
      permissions.push({ resource: perm.resource, actions: perm.actions });
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
  userId: string,
  resource: string,
  action: string,
  tenantId?: string | null
): Promise<boolean> {
  try {
    const permissions = await getUserPermissions(userId, tenantId);
    
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
  // Admin has full access (tenant-scoped at API level)
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
  userId: string,
  resource: string
): Promise<boolean> {
  return hasPermission(userId, resource, 'read');
}

/**
 * Check if user can modify a resource (write or update permission)
 */
export async function canModify(
  userId: string,
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
  userId: string,
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

