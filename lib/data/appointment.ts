/**
 * Data-access layer for the Appointment model (Phase 5 Batch 4 — clinical
 * core). Appointment carries a direct `tenantId` column
 * (DIRECTLY_SCOPED_MODELS in lib/prisma-tenant-extension.ts) — standard
 * runWithTenant(tenantId, fn) scoping applies.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migrateAppointments(): Mongoose `doctor`/`patient`/`provider`/`createdBy`
 * refs -> Prisma `doctorId`/`patientId`/`providerId`/`createdById` columns.
 * toAppointmentDTO() re-nests the resolved relations under their original
 * Mongoose-era key names (doctor/patient/provider/createdBy) so existing
 * frontend code that reads `appointment.patient.firstName` etc. keeps working.
 */
import prisma from '../prisma';
import type { Prisma, AppointmentStatus } from '@prisma/client';

export const appointmentInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  doctor: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specializationId: true,
      specialization: { select: { name: true } },
    },
  },
  provider: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

/** Re-nest resolved relations under Mongoose-era keys for frontend compatibility. */
export function toAppointmentDTO(appointment: AppointmentWithRelations) {
  const { id, doctorId, patientId, providerId, createdById, ...rest } = appointment;
  return {
    _id: id,
    id,
    doctorId,
    patientId,
    providerId,
    createdById,
    ...rest,
  };
}

export interface AppointmentFilter {
  tenantId?: string; // already handled by tenant context — accepted for explicit-branch call sites only
  date?: string;
  doctorId?: string;
  patientId?: string;
  statuses?: string[];
  isWalkIn?: boolean;
  room?: string;
}

export function buildAppointmentWhere(filter: AppointmentFilter): Prisma.AppointmentWhereInput {
  const where: Prisma.AppointmentWhereInput = {};
  if (filter.date) {
    const startOfDay = new Date(filter.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filter.date);
    endOfDay.setHours(23, 59, 59, 999);
    where.appointmentDate = { gte: startOfDay, lte: endOfDay };
  }
  if (filter.doctorId) where.doctorId = filter.doctorId;
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.statuses?.length) where.status = { in: filter.statuses as AppointmentStatus[] };
  if (filter.isWalkIn !== undefined) where.isWalkIn = filter.isWalkIn;
  if (filter.room) where.room = filter.room;
  return where;
}

export async function listAppointments(where: Prisma.AppointmentWhereInput) {
  const appointments = await prisma.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: [{ appointmentDate: 'asc' }, { appointmentTime: 'asc' }],
  });
  return appointments.map(toAppointmentDTO);
}

export async function getAppointmentById(id: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id }, include: appointmentInclude });
  return appointment ? toAppointmentDTO(appointment) : null;
}

export function findAppointmentByIdRaw(id: string) {
  return prisma.appointment.findUnique({ where: { id } });
}

export async function createAppointment(data: Prisma.AppointmentCreateInput) {
  const appointment = await prisma.appointment.create({ data, include: appointmentInclude });
  return toAppointmentDTO(appointment);
}

export async function updateAppointment(id: string, data: Prisma.AppointmentUpdateInput) {
  const appointment = await prisma.appointment.update({ where: { id }, data, include: appointmentInclude });
  return toAppointmentDTO(appointment);
}

export async function deleteAppointment(id: string) {
  return prisma.appointment.delete({ where: { id } });
}

/** Highest existing `APT-######` code number, for auto-generation (tenant-scoped by the active context). */
export async function getMaxAppointmentCodeNumber(): Promise<number> {
  const last = await prisma.appointment.findFirst({
    where: { appointmentCode: { not: null } },
    orderBy: { appointmentCode: 'desc' },
    select: { appointmentCode: true },
  });
  if (!last?.appointmentCode) return 0;
  const match = last.appointmentCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Count of today's walk-in appointments with scheduled/confirmed status, for queue-number assignment. */
export async function countTodayWalkIns(): Promise<{ maxQueueNumber: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const top = await prisma.appointment.findFirst({
    where: {
      isWalkIn: true,
      appointmentDate: { gte: today, lt: tomorrow },
      status: { in: ['scheduled', 'confirmed'] },
    },
    orderBy: { queueNumber: 'desc' },
    select: { queueNumber: true },
  });
  return { maxQueueNumber: top?.queueNumber ?? 0 };
}

export function findConflictingAppointment(doctorId: string, appointmentDate: Date, appointmentTime: string) {
  return prisma.appointment.findFirst({
    where: {
      doctorId,
      appointmentDate,
      appointmentTime,
      status: { in: ['scheduled', 'confirmed'] },
    },
  });
}

// ── Automation support (lib/automations/*) ───────────────────────────────────

/** Distinct patient ids with a completed/confirmed appointment dated on/after `since` (patient re-engagement). */
export async function distinctPatientIdsWithAppointmentSince(since: Date, statuses: AppointmentStatus[]): Promise<string[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      OR: [{ appointmentDate: { gte: since } }, { scheduledAt: { gte: since } }],
      status: { in: statuses },
    },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  return rows.map((r) => r.patientId);
}

export interface DayRangeFilter {
  dayStart: Date;
  dayEnd: Date;
  statuses: AppointmentStatus[];
}

/** Count of appointments matching the end-of-day-cleanup filter (still-pending statuses, dated today). */
export async function countAppointmentsInDayRange(filter: DayRangeFilter): Promise<number> {
  return prisma.appointment.count({
    where: {
      status: { in: filter.statuses },
      OR: [
        { appointmentDate: { gte: filter.dayStart, lte: filter.dayEnd } },
        { scheduledAt: { gte: filter.dayStart, lte: filter.dayEnd } },
      ],
    },
  });
}

/** Bulk-close still-pending appointments dated today into a terminal status (end-of-day cleanup). */
export async function bulkCloseAppointmentsInDayRange(
  filter: DayRangeFilter,
  newStatus: AppointmentStatus
): Promise<number> {
  const result = await prisma.appointment.updateMany({
    where: {
      status: { in: filter.statuses },
      OR: [
        { appointmentDate: { gte: filter.dayStart, lte: filter.dayEnd } },
        { scheduledAt: { gte: filter.dayStart, lte: filter.dayEnd } },
      ],
    },
    data: { status: newStatus },
  });
  return result.count;
}

/** Counts of today's appointments by status, plus revenue-adjacent aggregates, for daily/periodic report generation. */
export interface ReportDateRange {
  start: Date;
  end: Date;
}

export async function countAppointmentsInRange(range: ReportDateRange, extraWhere: Prisma.AppointmentWhereInput = {}) {
  return prisma.appointment.count({
    where: { appointmentDate: { gte: range.start, lte: range.end }, ...extraWhere },
  });
}

export async function groupAppointmentsByStatusInRange(range: ReportDateRange) {
  return prisma.appointment.groupBy({
    by: ['status'],
    where: { appointmentDate: { gte: range.start, lte: range.end } },
    _count: { _all: true },
  });
}

export function findAppointmentsNeedingReminders(now: Date, futureTime: Date) {
  return prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: now, lte: futureTime },
      status: { in: ['scheduled', 'confirmed'] },
    },
    include: {
      patient: { select: { firstName: true, lastName: true, phone: true } },
      doctor: { select: { firstName: true, lastName: true } },
    },
  });
}
