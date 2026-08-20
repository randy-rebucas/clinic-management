/**
 * Data-access layer for the Specialization model.
 *
 * Specialization is GLOBAL — it has no `tenantId` column and is absent from
 * DIRECTLY_SCOPED_MODELS / JUNCTION_SCOPED_MODELS in
 * lib/prisma-tenant-extension.ts, so calls here pass straight through the
 * extension untouched regardless of tenant context. Callers wrap these in
 * runAsSystem(fn) for pattern consistency (matching lib/data/tenant.ts),
 * not because scoping requires it.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export interface ListSpecializationsOptions {
  category?: string;
  search?: string;
}

export function listSpecializations(opts: ListSpecializationsOptions = {}) {
  const { category, search } = opts;

  const where: Prisma.SpecializationWhereInput = { active: true };
  if (category) where.category = category;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  return prisma.specialization.findMany({
    where,
    select: { id: true, name: true, description: true, category: true, active: true },
    orderBy: { name: 'asc' },
  });
}

export function getSpecializationById(id: string) {
  return prisma.specialization.findUnique({ where: { id } });
}

export function getSpecializationByName(name: string) {
  return prisma.specialization.findUnique({ where: { name } });
}

/** Find a specialization by name, excluding a given id — for update-time uniqueness checks. */
export function findSpecializationNameConflict(name: string, excludeId: string) {
  return prisma.specialization.findFirst({ where: { name, id: { not: excludeId } } });
}

export function createSpecialization(data: Prisma.SpecializationCreateInput) {
  return prisma.specialization.create({ data });
}

export function updateSpecialization(id: string, data: Prisma.SpecializationUpdateInput) {
  return prisma.specialization.update({ where: { id }, data });
}

export function deleteSpecialization(id: string) {
  return prisma.specialization.delete({ where: { id } });
}

/** Count doctors currently using this specialization — used to block delete. */
export function countDoctorsUsingSpecialization(id: string) {
  return prisma.doctor.count({ where: { specializationId: id } });
}
