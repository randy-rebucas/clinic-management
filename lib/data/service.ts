/**
 * Data-access layer for the Service model.
 *
 * Service is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for
 * cron/admin code that must legitimately cross tenants — BEFORE calling
 * into this module. Functions here do not open their own context.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export interface ListServicesOptions {
  category?: string;
  active?: boolean;
  search?: string;
  take?: number;
}

export function listServices(opts: ListServicesOptions = {}) {
  const { category, active, search, take } = opts;

  const where: Prisma.ServiceWhereInput = {};
  if (active !== undefined) where.active = active;
  if (category) where.category = category as Prisma.ServiceWhereInput['category'];
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  return prisma.service.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    take,
  });
}

export function getServiceById(id: string) {
  return prisma.service.findUnique({ where: { id } });
}

/**
 * Find the most recently created service whose `code` starts with the given
 * prefix, used to auto-generate the next sequential code (see
 * app/api/services/route.ts POST).
 */
export function getLastServiceByCodePrefix(prefix: string) {
  return prisma.service.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
  });
}

export function createService(data: Prisma.ServiceCreateInput) {
  return prisma.service.create({ data });
}

export function updateService(id: string, data: Prisma.ServiceUpdateInput) {
  return prisma.service.update({ where: { id }, data });
}

/** Soft-delete: sets active=false, matching the Mongoose route's behavior. */
export function deactivateService(id: string) {
  return prisma.service.update({ where: { id }, data: { active: false } });
}
