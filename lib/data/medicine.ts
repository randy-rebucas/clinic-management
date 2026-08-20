/**
 * Data-access layer for the Medicine model.
 *
 * Medicine is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for
 * cron/admin code that must legitimately cross tenants — BEFORE calling
 * into this module. Functions here do not open their own context.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export interface ListMedicinesOptions {
  category?: string;
  active?: boolean;
  search?: string;
  take?: number;
}

export function listMedicines(opts: ListMedicinesOptions = {}) {
  const { category, active, search, take } = opts;

  const where: Prisma.MedicineWhereInput = {};
  if (active !== undefined) where.active = active;
  if (category) where.category = category;
  if (search) {
    // NOTE: the Mongoose route did a case-insensitive substring match against
    // each brandNames array element via $in: [RegExp]. Prisma's native
    // Postgres array filters only support exact-value matching (`has`/
    // `hasSome`), not substring-per-element, so a brand name search here is
    // narrower than before (exact match only). name/genericName substring
    // search is preserved.
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { genericName: { contains: search, mode: 'insensitive' } },
      { brandNames: { has: search } },
    ];
  }

  return prisma.medicine.findMany({
    where,
    orderBy: { name: 'asc' },
    take,
  });
}

export function getMedicineById(id: string) {
  return prisma.medicine.findUnique({ where: { id } });
}

export function createMedicine(data: Prisma.MedicineCreateInput) {
  return prisma.medicine.create({ data });
}

export function updateMedicine(id: string, data: Prisma.MedicineUpdateInput) {
  return prisma.medicine.update({ where: { id }, data });
}

export function deleteMedicine(id: string) {
  return prisma.medicine.delete({ where: { id } });
}
