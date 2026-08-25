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

/** Matches the `.populate('specializationId', 'name description category')` shape used by most doctor sub-routes. */
const withSpecializationFull = {
  specialization: { select: { name: true, description: true, category: true } },
} satisfies Prisma.DoctorInclude;

export function getDoctorById(id: string) {
  return prisma.doctor.findUnique({
    where: { id },
    include: withSpecialization,
  });
}

/** Same as getDoctorById but with the fuller specialization projection (name/description/category). */
export function getDoctorByIdFull(id: string) {
  return prisma.doctor.findUnique({
    where: { id },
    include: withSpecializationFull,
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

/** Count of active doctors in the active tenant. */
export async function countActiveDoctors(): Promise<number> {
  return prisma.doctor.count({ where: { status: 'active' } });
}

// ============================================================================
// Extended CRUD + sub-resource helpers (app/api/doctors/*)
// ============================================================================

/**
 * Full doctor list (all scalar fields + specialization name/description/
 * category + schedule + availabilityOverrides) ordered by createdAt desc —
 * matches the original Mongoose `Doctor.find(query).populate('specializationId',
 * 'name description category').sort({ createdAt: -1 })` shape used by
 * GET /api/doctors, as opposed to the trimmed `listDoctors()` select above
 * (built for appointment-booking flows only).
 */
export function listDoctorsFull(opts: ListDoctorsOptions = {}) {
  const where: Prisma.DoctorWhereInput = {};
  if (opts.status) where.status = opts.status as Prisma.DoctorWhereInput['status'];
  return prisma.doctor.findMany({
    where,
    include: {
      specialization: { select: { name: true, description: true, category: true } },
      schedule: true,
      availabilityOverrides: true,
    },
    orderBy: { createdAt: 'desc' },
    skip: opts.skip,
    take: opts.take,
  });
}

export function createDoctor(data: Prisma.DoctorCreateInput) {
  return prisma.doctor.create({ data, include: withSpecializationFull });
}

export function updateDoctor(id: string, data: Prisma.DoctorUpdateInput) {
  return prisma.doctor.update({ where: { id }, data, include: withSpecializationFull });
}

export function deleteDoctor(id: string) {
  return prisma.doctor.delete({ where: { id } });
}

/** Plain findUnique (no include) — used by sub-resource routes that just need existence/scalars. */
export function findDoctorRawById(id: string) {
  return prisma.doctor.findUnique({ where: { id } });
}

// ── Internal notes (DoctorInternalNote child table) ─────────────────────────

/**
 * Notes ordered by createdAt ascending — mirrors the Mongoose array's
 * insertion order, since the old routes addressed notes by array index.
 */
export function listDoctorNotes(doctorId: string) {
  return prisma.doctorInternalNote.findMany({
    where: { doctorId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addDoctorInternalNote(
  doctorId: string,
  note: { note: string; createdById?: string; isImportant?: boolean }
) {
  return prisma.doctor.update({
    where: { id: doctorId },
    data: {
      internalNotes: {
        create: {
          note: note.note,
          createdById: note.createdById,
          isImportant: note.isImportant ?? false,
        },
      },
    },
    include: withSpecializationFull,
  });
}

/** Delete the note at `index` in createdAt-ascending order (mirrors the old Mongoose array-index delete). */
export async function deleteDoctorInternalNoteByIndex(doctorId: string, index: number) {
  const notes = await listDoctorNotes(doctorId);
  if (index >= 0 && index < notes.length) {
    await prisma.doctorInternalNote.delete({ where: { id: notes[index].id } });
  }
  return prisma.doctor.findUnique({ where: { id: doctorId }, include: withSpecializationFull });
}

// ── Schedule / availability overrides ────────────────────────────────────────

export function getDoctorScheduleData(id: string) {
  return prisma.doctor.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      schedule: true,
      availabilityOverrides: true,
    },
  });
}

/** Replace the full schedule + availabilityOverrides arrays atomically (deleteMany + create nested writes). */
export function replaceDoctorSchedule(
  id: string,
  schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable?: boolean }> | undefined,
  availabilityOverrides: Array<{ date: string | Date; isAvailable: boolean; startTime?: string; endTime?: string; reason?: string }> | undefined
) {
  return prisma.doctor.update({
    where: { id },
    data: {
      ...(schedule !== undefined
        ? {
            schedule: {
              deleteMany: {},
              create: schedule.map((s) => ({
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                isAvailable: s.isAvailable ?? true,
              })),
            },
          }
        : {}),
      ...(availabilityOverrides !== undefined
        ? {
            availabilityOverrides: {
              deleteMany: {},
              create: availabilityOverrides.map((o) => ({
                date: new Date(o.date),
                isAvailable: o.isAvailable,
                startTime: o.startTime,
                endTime: o.endTime,
                reason: o.reason,
              })),
            },
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      schedule: true,
      availabilityOverrides: true,
    },
  });
}

// ── Professional fees ────────────────────────────────────────────────────────
// Note: the Mongoose-era Doctor.professionalFees embedded array was dropped
// during the Prisma migration in favor of the fields already modeled
// directly on Invoice (professionalFeeDoctorId/professionalFee/
// professionalFeeType/professionalFeeNotes — see the
// "InvoiceProfessionalFeeDoctor" relation in prisma/schema.prisma). A "fee
// entry" is therefore just an Invoice row tagged with this doctor, and
// listing a doctor's fees means listing the invoices tagged with them.

const feeInvoiceSelect = {
  id: true,
  visitId: true,
  professionalFee: true,
  professionalFeeType: true,
  professionalFeeNotes: true,
  updatedAt: true,
} satisfies Prisma.InvoiceSelect;

export function listDoctorProfessionalFees(doctorId: string) {
  return prisma.invoice.findMany({
    where: { professionalFeeDoctorId: doctorId },
    select: feeInvoiceSelect,
    orderBy: { updatedAt: 'desc' },
  });
}

/** Tags the given invoice with this doctor's professional fee. Throws if the invoice doesn't exist (Prisma P2025). */
export function addDoctorProfessionalFee(
  doctorId: string,
  fee: { invoiceId: string; amount: number; type?: string; notes?: string }
) {
  return prisma.invoice.update({
    where: { id: fee.invoiceId },
    data: {
      professionalFeeDoctorId: doctorId,
      professionalFee: fee.amount,
      professionalFeeType: fee.type as Prisma.InvoiceUpdateInput['professionalFeeType'],
      professionalFeeNotes: fee.notes,
    },
    select: feeInvoiceSelect,
  });
}

// ── Performance / productivity metrics ───────────────────────────────────────

export function updateDoctorPerformanceMetrics(
  id: string,
  metrics: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
  }
) {
  return prisma.doctor.update({
    where: { id },
    data: {
      perfTotalAppointments: metrics.totalAppointments,
      perfCompletedAppointments: metrics.completedAppointments,
      perfCancelledAppointments: metrics.cancelledAppointments,
      perfNoShowAppointments: metrics.noShowAppointments,
      perfAverageRating: metrics.averageRating,
      perfLastUpdated: new Date(),
    },
  });
}

export interface DoctorAppointmentDateRange {
  startDate?: Date;
  endDate?: Date;
}

/** Appointments for a doctor, optionally bounded by appointmentDate — used by performance/productivity routes. */
export function listDoctorAppointments(doctorId: string, range: DoctorAppointmentDateRange = {}) {
  const where: Prisma.AppointmentWhereInput = { doctorId };
  if (range.startDate || range.endDate) {
    where.appointmentDate = {
      ...(range.startDate ? { gte: range.startDate } : {}),
      ...(range.endDate ? { lte: range.endDate } : {}),
    };
  }
  return prisma.appointment.findMany({ where });
}

/**
 * Visits/prescriptions "for a doctor" — the legacy Mongoose routes filtered
 * Visit.provider / Prescription.prescribedBy (both User refs) by the
 * DOCTOR's id, not the doctor's linked User id, which never actually
 * matched any row (Doctor._id and User._id are always distinct documents).
 * That mismatch is preserved verbatim here (providerId/prescribedById are
 * filtered against the Doctor id) so behavior — always an empty result —
 * stays identical to production today.
 */
export function listDoctorVisits(doctorId: string, range: { startDate?: Date; endDate?: Date } = {}) {
  const where: Prisma.VisitWhereInput = { providerId: doctorId };
  if (range.startDate || range.endDate) {
    where.date = {
      ...(range.startDate ? { gte: range.startDate } : {}),
      ...(range.endDate ? { lte: range.endDate } : {}),
    };
  }
  return prisma.visit.findMany({ where });
}

export function listDoctorPrescriptions(doctorId: string, range: { startDate?: Date; endDate?: Date } = {}) {
  const where: Prisma.PrescriptionWhereInput = { prescribedById: doctorId };
  if (range.startDate || range.endDate) {
    where.issuedAt = {
      ...(range.startDate ? { gte: range.startDate } : {}),
      ...(range.endDate ? { lte: range.endDate } : {}),
    };
  }
  return prisma.prescription.findMany({ where });
}
