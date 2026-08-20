/**
 * Minimal data-access layer for the Doctor model — built for Phase 5 Batch 4
 * (clinical core: Appointment/Visit/Prescription/LabResult/Imaging/Procedure)
 * which only needs to look doctors up by id and list them for
 * appointment-booking/validation flows. Doctor carries a direct `tenantId`
 * column (DIRECTLY_SCOPED_MODELS in lib/prisma-tenant-extension.ts).
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller via runWithTenant(tenantId, fn) or
 * runAsSystem(fn) — functions here do not open their own context.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

const withSpecialization = {
  specialization: { select: { name: true } },
} satisfies Prisma.DoctorInclude;

export function getDoctorById(id: string) {
  return prisma.doctor.findUnique({
    where: { id },
    include: withSpecialization,
  });
}

/** Bare existence/status check — used to validate a doctor belongs to the current tenant before booking. */
export function findActiveDoctorById(id: string) {
  return prisma.doctor.findFirst({
    where: { id, status: 'active' },
  });
}

export interface ListDoctorsOptions {
  status?: string;
  skip?: number;
  take?: number;
}

export function listDoctors(opts: ListDoctorsOptions = {}) {
  const where: Prisma.DoctorWhereInput = {};
  if (opts.status) where.status = opts.status as Prisma.DoctorWhereInput['status'];
  return prisma.doctor.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      specializationId: true,
      specialization: { select: { name: true } },
      schedule: true,
      status: true,
    },
    skip: opts.skip,
    take: opts.take,
  });
}
