/**
 * Data-access layer for the Admin (staff profile) model.
 *
 * Admin is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) BEFORE calling into this
 * module. Functions here do not open their own context.
 *
 * Minimal by design — currently only covers what app/api/tenants/onboard
 * needs (create the Admin profile for a freshly-onboarded tenant's admin
 * user, and look one up by email to avoid duplicates).
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function getAdminByEmail(tenantId: string, email: string) {
  return prisma.admin.findFirst({ where: { tenantId, email } });
}

export function createAdmin(data: Prisma.AdminCreateInput) {
  return prisma.admin.create({ data });
}
