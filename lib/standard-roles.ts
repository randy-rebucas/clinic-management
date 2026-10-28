import { Types } from 'mongoose';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { STANDARD_ROLE, isStandardRole, type StandardRole } from '@/lib/roles';

/**
 * Give a clinic one of the standard roles with the standard access for its kind (what a new
 * clinic is onboarded with). If the clinic already has it, that role is returned unchanged.
 */
export async function createStandardRole(
  tenantId: Types.ObjectId,
  name: StandardRole,
  overrides: { displayName?: string; description?: string } = {}
) {
  const standard = STANDARD_ROLE[name];
  const access = DEFAULT_ROLE_PERMISSIONS[name] ?? [];
  let role;
  try {
    role = await Role.create({
      tenantId,
      name,
      displayName: overrides.displayName || standard.displayName,
      description: overrides.description || standard.description,
      level: standard.level,
      isActive: true,
      defaultPermissions: access,
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    // Created at the same moment by another request.
    const existing = await Role.findOne({ tenantId, name });
    if (existing) return { role: existing, created: false };
    throw error;
  }
  const docs = await Permission.insertMany(
    access.map((p) => ({ tenantId, role: role._id, resource: p.resource, actions: p.actions }))
  );
  role.permissions = docs.map((d) => d._id);
  await role.save();
  return { role, created: true };
}

/**
 * The clinic's role by name, adding it first when it is a standard role the clinic doesn't have
 * yet (a clinic onboarded before that role existed).
 */
export async function findOrCreateStandardRole(tenantId: Types.ObjectId, name: string) {
  const role = await Role.findOne({ tenantId, name });
  if (role || !isStandardRole(name)) return role;
  return (await createStandardRole(tenantId, name)).role;
}
