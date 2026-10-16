import { Types } from 'mongoose';
import Appointment from '@/models/Appointment';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';
import { dayRangeInTz, formatInTz, combineDateAndTimeInTz } from '@/lib/tz';

/** Statuses that occupy a doctor's time slot. */
export const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled'];

const toObjectId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

/** "9:5" / "09:05" → minutes since midnight, or null. */
export function timeToMinutes(time: string | null | undefined): number | null {
  const m = typeof time === 'string' ? time.match(/^(\d{1,2}):(\d{2})/) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Zero-padded "HH:mm". */
export function normalizeTime(time: string | null | undefined): string | null {
  const mins = timeToMinutes(time);
  if (mins === null) return null;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Clinic-local day containing an appointment date. "yyyy-MM-dd" strings are read as a
 * clinic-local calendar day; anything else is treated as an instant.
 */
export function appointmentDayRange(date: Date | string, tz: string) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return dayRangeInTz(combineDateAndTimeInTz(date, '12:00', tz), tz);
  }
  return dayRangeInTz(date, tz);
}

/**
 * Find an existing active appointment for the same doctor whose time range overlaps
 * [time, time + duration) on the same clinic-local day.
 */
export async function findDoctorConflict(opts: {
  tenantId: string | Types.ObjectId;
  doctorId: string | Types.ObjectId;
  appointmentDate: Date | string;
  appointmentTime: string;
  duration?: number;
  tz: string;
  excludeId?: string | Types.ObjectId;
}) {
  const start = timeToMinutes(opts.appointmentTime);
  if (start === null) return null;
  const end = start + (opts.duration || 30);
  const { start: dayStart, end: dayEnd } = appointmentDayRange(opts.appointmentDate, opts.tz);

  const query: Record<string, unknown> = {
    tenantId: toObjectId(opts.tenantId),
    doctor: toObjectId(opts.doctorId),
    appointmentDate: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
  };
  if (opts.excludeId) query._id = { $ne: toObjectId(opts.excludeId) };

  const sameDay = await Appointment.find(query).select('appointmentTime duration appointmentCode').lean();
  return (
    sameDay.find((apt: any) => {
      const s = timeToMinutes(apt.appointmentTime);
      if (s === null) return false;
      const e = s + (apt.duration || 30);
      return start < e && s < end;
    }) || null
  );
}

/** Allocate the next APT-xxxxxx code for a tenant. */
export async function nextAppointmentCode(tenantId: string | Types.ObjectId): Promise<string> {
  const tid = toObjectId(tenantId);
  const seq = await nextSequence(
    tid,
    'appointment',
    maxCodeSeed(Appointment, 'appointmentCode', { tenantId: tid, appointmentCode: { $exists: true, $ne: null } })
  );
  return formatCode('APT', seq);
}

/** Allocate the next walk-in queue number for the clinic-local day. */
export async function nextWalkInNumber(tenantId: string | Types.ObjectId, tz: string, date: Date = new Date()): Promise<number> {
  const tid = toObjectId(tenantId);
  const { start, end } = dayRangeInTz(date, tz);
  return nextSequence(tid, `walkin:${formatInTz(date, 'yyyy-MM-dd', tz)}`, async () => {
    const last = await Appointment.findOne({
      tenantId: tid,
      isWalkIn: true,
      appointmentDate: { $gte: start, $lte: end },
    })
      .sort({ queueNumber: -1 })
      .select('queueNumber')
      .lean() as any;
    return last?.queueNumber || 0;
  });
}

/** True for a duplicate-key error on the doctor/time slot index (as opposed to a code collision). */
export function isSlotDuplicateError(error: any): boolean {
  if (error?.code !== 11000) return false;
  const keys = Object.keys(error?.keyPattern || error?.keyValue || {});
  return keys.length === 0 || keys.includes('appointmentTime') || keys.includes('doctor');
}
