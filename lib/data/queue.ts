/**
 * Data-access layer for Queue. Queue is a DIRECTLY_SCOPED_MODEL in
 * lib/prisma-tenant-extension.ts (has its own tenantId column).
 *
 * Every function here assumes the caller has already established tenant
 * context via runWithTenant(tenantId, fn) or runAsSystem(fn).
 *
 * Shape: Mongoose's Queue.vitals was a single Mixed sub-object; Prisma flattens
 * it to vitalsBp/vitalsHr/... columns (mirrors Visit.vitals — see schema
 * comments). toQueueDTO() reconstructs the nested `vitals` shape the frontend
 * still expects; flattenVitalsInput() does the reverse for writes.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

/**
 * QueueType (walk_in/follow_up) and QueueStatus (in_progress/no_show) use
 * Prisma @map() to keep hyphenated DB column values ('walk-in', 'in-progress',
 * 'no-show') for Mongoose-era compatibility, but the *Prisma client / JS*
 * enum members are the underscored names. The pre-migration API contract
 * (frontend, other services) still speaks the hyphenated Mongoose strings, so
 * every write/read through this module converts at the boundary.
 */
const toDbEnum = (v: string | undefined) => (v ? v.replace(/-/g, '_') : v);
const fromDbEnum = (v: string | undefined | null) => (v ? v.replace(/_/g, '-') : v);

const fullInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  doctor: { select: { id: true, firstName: true, lastName: true } },
  room: { select: { id: true, name: true, roomNumber: true } },
  appointment: { select: { id: true, appointmentCode: true, appointmentDate: true, appointmentTime: true } },
} satisfies Prisma.QueueInclude;

export type QueueWithRelations = Prisma.QueueGetPayload<{ include: typeof fullInclude }>;

export function toQueueDTO(queue: QueueWithRelations) {
  const {
    vitalsBp,
    vitalsHr,
    vitalsRr,
    vitalsTempC,
    vitalsSpo2,
    vitalsHeightCm,
    vitalsWeightKg,
    vitalsBmi,
    patientId,
    doctorId,
    roomId,
    appointmentId,
    visitId,
    ...rest
  } = queue;

  return {
    _id: queue.id,
    ...rest,
    queueType: fromDbEnum(queue.queueType) as string,
    status: fromDbEnum(queue.status) as string,
    checkInMethod: fromDbEnum(queue.checkInMethod ?? undefined),
    patient: queue.patient ?? patientId,
    doctor: queue.doctor ?? doctorId,
    room: queue.room ?? roomId,
    appointment: queue.appointment ?? appointmentId,
    visit: visitId,
    vitals: {
      bp: vitalsBp ?? undefined,
      hr: vitalsHr ?? undefined,
      rr: vitalsRr ?? undefined,
      tempC: vitalsTempC ?? undefined,
      spo2: vitalsSpo2 ?? undefined,
      heightCm: vitalsHeightCm ?? undefined,
      weightKg: vitalsWeightKg ?? undefined,
      bmi: vitalsBmi ?? undefined,
    },
  };
}

export function flattenVitalsInput(vitals: Record<string, any> | undefined): Record<string, any> {
  if (!vitals) return {};
  return {
    vitalsBp: vitals.bp ?? undefined,
    vitalsHr: vitals.hr ?? undefined,
    vitalsRr: vitals.rr ?? undefined,
    vitalsTempC: vitals.tempC ?? undefined,
    vitalsSpo2: vitals.spo2 ?? undefined,
    vitalsHeightCm: vitals.heightCm ?? undefined,
    vitalsWeightKg: vitals.weightKg ?? undefined,
    vitalsBmi: vitals.bmi ?? undefined,
  };
}

export interface CreateQueueInput {
  queueNumber: string;
  queueType: Prisma.QueueCreateInput['queueType'];
  patientId: string;
  patientName: string;
  appointmentId?: string;
  visitId?: string;
  doctorId?: string;
  roomId?: string;
  priority?: number;
  qrCode?: string;
  status?: Prisma.QueueCreateInput['status'];
  checkedIn?: boolean;
}

export async function createQueueEntry(input: CreateQueueInput) {
  const queue = await prisma.queue.create({
    data: {
      queueNumber: input.queueNumber,
      queueType: toDbEnum(input.queueType as unknown as string) as Prisma.QueueCreateInput['queueType'],
      patientId: input.patientId,
      patientName: input.patientName,
      appointmentId: input.appointmentId,
      visitId: input.visitId,
      doctorId: input.doctorId,
      roomId: input.roomId,
      priority: input.priority ?? 0,
      qrCode: input.qrCode,
      status: toDbEnum((input.status as unknown as string) ?? 'waiting') as Prisma.QueueCreateInput['status'],
      checkedIn: input.checkedIn ?? false,
    },
    include: fullInclude,
  });
  return toQueueDTO(queue);
}

/** Auto-generate a queue number: prefix by type + date + daily counter, mirroring Mongoose's pre-validate hook. */
export function buildQueueNumberPrefix(queueType: string): string {
  return queueType === 'appointment' ? 'A' : queueType === 'walk-in' ? 'W' : 'F';
}

export async function setQueueQrCode(id: string, qrCode: string) {
  const queue = await prisma.queue.update({ where: { id }, data: { qrCode }, include: fullInclude });
  return toQueueDTO(queue);
}

export interface CountTodayQueueOptions {
  queueType: string;
  startOfDay: Date;
  endOfDay: Date;
}

export async function countTodayQueueEntries(opts: CountTodayQueueOptions) {
  return prisma.queue.count({
    where: {
      queueType: toDbEnum(opts.queueType) as Prisma.EnumQueueTypeFilter['equals'],
      queuedAt: { gte: opts.startOfDay, lte: opts.endOfDay },
    },
  });
}

export async function getQueueById(id: string) {
  const queue = await prisma.queue.findUnique({ where: { id }, include: fullInclude });
  return queue ? toQueueDTO(queue) : null;
}

export interface ListQueueFilter {
  status?: string[];
  doctorId?: string;
  roomId?: string;
}

export function buildQueueWhere(filter: ListQueueFilter): Prisma.QueueWhereInput {
  const where: Prisma.QueueWhereInput = {};
  if (filter.status?.length) {
    where.status = { in: filter.status.map(toDbEnum) as Prisma.EnumQueueStatusFilter['in'] };
  }
  if (filter.doctorId) where.doctorId = filter.doctorId;
  if (filter.roomId) where.roomId = filter.roomId;
  return where;
}

export async function listQueueEntries(where: Prisma.QueueWhereInput, take?: number) {
  const queues = await prisma.queue.findMany({
    where,
    include: fullInclude,
    orderBy: [{ priority: 'asc' }, { queuedAt: 'asc' }],
    take,
  });
  return queues.map(toQueueDTO);
}

export interface UpdateQueueInput extends Record<string, any> {
  vitals?: Record<string, any>;
}

export async function updateQueueEntry(id: string, body: UpdateQueueInput) {
  const { vitals, patient, doctor, room, appointment, visit, patientId, doctorId, roomId, appointmentId, visitId, _skipAutomation, ...rest } = body;

  if (rest.status !== undefined) rest.status = toDbEnum(rest.status);
  if (rest.queueType !== undefined) rest.queueType = toDbEnum(rest.queueType);
  if (rest.checkInMethod !== undefined) rest.checkInMethod = toDbEnum(rest.checkInMethod);

  const data: Prisma.QueueUpdateInput = { ...rest, ...flattenVitalsInput(vitals) };
  if (doctorId !== undefined) data.doctor = doctorId ? { connect: { id: doctorId } } : { disconnect: true };
  if (roomId !== undefined) data.room = roomId ? { connect: { id: roomId } } : { disconnect: true };

  // Mirror Mongoose's pre-save hook: when transitioning to completed with
  // both startedAt and completedAt known, compute consultationDuration.
  if (rest.status === 'completed') {
    const current = await prisma.queue.findUnique({ where: { id }, select: { startedAt: true } });
    const startedAt = data.startedAt ? new Date(data.startedAt as unknown as string) : current?.startedAt;
    const completedAt = data.completedAt ? new Date(data.completedAt as unknown as string) : new Date();
    if (startedAt && completedAt) {
      data.consultationDuration = Math.round((completedAt.getTime() - startedAt.getTime()) / (1000 * 60));
    }
  }

  const queue = await prisma.queue.update({
    where: { id },
    data,
    include: fullInclude,
  });
  return toQueueDTO(queue);
}

export async function cancelQueueEntry(id: string) {
  const queue = await prisma.queue.update({
    where: { id },
    data: { status: 'cancelled' },
    include: fullInclude,
  });
  return toQueueDTO(queue);
}

// ── Automation support (lib/automations/end-of-day-cleanup.ts) ──────────────

export interface QueueDayRangeFilter {
  dayStart: Date;
  dayEnd: Date;
  statuses: string[]; // hyphenated app-facing values, e.g. ['waiting', 'in-progress']
}

export async function countQueueInDayRange(filter: QueueDayRangeFilter): Promise<number> {
  return prisma.queue.count({
    where: {
      status: { in: filter.statuses.map(toDbEnum) as Prisma.EnumQueueStatusFilter['in'] },
      queuedAt: { gte: filter.dayStart, lte: filter.dayEnd },
    },
  });
}

export async function bulkCloseQueueInDayRange(filter: QueueDayRangeFilter, newStatus: string): Promise<number> {
  const result = await prisma.queue.updateMany({
    where: {
      status: { in: filter.statuses.map(toDbEnum) as Prisma.EnumQueueStatusFilter['in'] },
      queuedAt: { gte: filter.dayStart, lte: filter.dayEnd },
    },
    data: {
      status: toDbEnum(newStatus) as Prisma.QueueUpdateInput['status'],
      completedAt: new Date(),
      completionNotes: 'Auto-closed by end-of-day cleanup',
    },
  });
  return result.count;
}

export async function getQueueEntryRaw(id: string) {
  return prisma.queue.findUnique({ where: { id } });
}
