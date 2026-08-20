/**
 * Data-access layer for the Role model (+ its RoleDefaultPermission and
 * Permission relations).
 *
 * Role is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for
 * cron/admin code that must legitimately cross tenants — BEFORE calling
 * into this module. Functions here do not open their own context.
 */
import prisma from '../prisma';
import type { Prisma, RoleName } from '@prisma/client';

const withPermissions = { permissions: true } satisfies Prisma.RoleInclude;
const withPermissionsAndDefaults = { permissions: true, defaultPermissions: true } satisfies Prisma.RoleInclude;

export interface GetRoleByIdOptions {
  /** Include the RoleDefaultPermission child rows too. Default false. */
  withDefaultPermissions?: boolean;
}

// Function overloads (rather than one signature with a runtime
// `include: cond ? x : y`) so the return type actually reflects whether
// `defaultPermissions` is included.
export function getRoleById(id: string, opts: { withDefaultPermissions: true }): ReturnType<typeof prisma.role.findUnique<{ where: { id: string }; include: typeof withPermissionsAndDefaults }>>;
export function getRoleById(id: string, opts?: GetRoleByIdOptions): ReturnType<typeof prisma.role.findUnique<{ where: { id: string }; include: typeof withPermissions }>>;
export function getRoleById(id: string, opts: GetRoleByIdOptions = {}) {
  return prisma.role.findUnique({
    where: { id },
    include: opts.withDefaultPermissions ? withPermissionsAndDefaults : withPermissions,
  });
}

export function getRoleByName(name: RoleName) {
  return prisma.role.findFirst({
    where: { name },
    include: withPermissions,
  });
}

/**
 * Prisma's RoleName enum (prisma/schema.prisma) is JS-facing as
 * `medical_representative` — the `@map("medical-representative")` on that
 * enum member only renames the value stored in Postgres, it does NOT change
 * the string the Prisma Client hands back to application code. Every other
 * part of this app (session payloads, the StaffRole/RoleName unions in
 * app/lib/definitions.ts and lib/permissions.ts, defaultRolePermissions
 * keys) uses the hyphenated 'medical-representative' form throughout. These
 * two helpers convert at the boundary where a Prisma RoleName value crosses
 * into/out of app-level role-name strings; every other RoleName member is
 * spelled identically in both forms so this is a no-op for them.
 */
export function roleNameToAppRole(name: RoleName): string {
  return name === 'medical_representative' ? 'medical-representative' : (name as string);
}

export function appRoleToRoleName(role: string): RoleName {
  return (role === 'medical-representative' ? 'medical_representative' : role) as RoleName;
}

export function listRoles() {
  return prisma.role.findMany({
    include: withPermissions,
    orderBy: { createdAt: 'desc' },
  });
}

export function createRole(data: Prisma.RoleCreateInput) {
  return prisma.role.create({
    data,
    include: withPermissions,
  });
}

/**
 * Upsert a tenant's role by (tenantId, name) and replace its permission set
 * atomically — used by the tenant-onboarding flow (app/api/tenants/onboard)
 * to seed the 5 fixed roles (admin/doctor/nurse/receptionist/accountant)
 * with their default permissions. Unlike the old Mongoose route, this does
 * NOT need the "find role without tenantId" backward-compatibility branch —
 * that existed to migrate pre-multi-tenant data, which does not apply to a
 * fresh Prisma-era tenant.
 */
export function upsertRoleWithPermissions(
  tenantId: string,
  name: RoleName,
  data: { displayName: string; description?: string; level?: number },
  permissions: { resource: string; actions: string[] }[]
) {
  return prisma.role.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: {
      tenant: { connect: { id: tenantId } },
      name,
      displayName: data.displayName,
      description: data.description,
      level: data.level,
      isActive: true,
      defaultPermissions: { create: permissions },
      permissions: { create: permissions.map((p) => ({ tenantId, resource: p.resource, actions: p.actions })) },
    },
    update: {
      displayName: data.displayName,
      description: data.description,
      level: data.level,
      isActive: true,
      defaultPermissions: { deleteMany: {}, create: permissions },
      permissions: {
        deleteMany: {},
        create: permissions.map((p) => ({ tenantId, resource: p.resource, actions: p.actions })),
      },
    },
    include: withPermissionsAndDefaults,
  });
}
