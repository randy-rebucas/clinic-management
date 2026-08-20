/**
 * Data-access layer for the Permission model.
 *
 * Permission is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for
 * cron/admin code that must legitimately cross tenants — BEFORE calling
 * into this module.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

const withRelations = {
  user: { select: { id: true, name: true, email: true } },
  roles: true,
} satisfies Prisma.PermissionInclude;

export function listPermissions(filter?: Prisma.PermissionWhereInput) {
  return prisma.permission.findMany({
    where: filter,
    include: withRelations,
    orderBy: { createdAt: 'desc' },
  });
}

export function getPermissionById(id: string) {
  return prisma.permission.findUnique({
    where: { id },
    include: withRelations,
  });
}

export function createPermission(data: Prisma.PermissionCreateInput) {
  return prisma.permission.create({ data, include: withRelations });
}

export function updatePermission(id: string, data: Prisma.PermissionUpdateInput) {
  return prisma.permission.update({ where: { id }, data, include: withRelations });
}

export function deletePermission(id: string) {
  return prisma.permission.delete({ where: { id } });
}
