// End-of-Day Cleanup Automation
// Closes queue entries and unattended appointments at the end of each clinic day.
// Unattended appointments become 'no-show' (or 'completed' when the patient was
// actually seen); appointments later than "now" are never touched.

import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { Types } from 'mongoose';
import { dayRangeInTz, dayRangeOffsetInTz, combineDateAndTimeInTz } from '@/lib/tz';
import { forEachTenant, errorMessage, type AutomationTenant } from './shared';

export interface EndOfDayCleanupResult {
  queues: {
    matched: number;
    updated: number;
    statuses: string[];
  };
  appointments: {
    matched: number;
    updated: number;
    statuses: string[];
  };
  errors: string[];
  ranAt: Date;
}

export interface EndOfDayCleanupOptions {
  /** Scope cleanup to a specific tenant. Omit to run across all active tenants. */
  tenantId?: Types.ObjectId | string;
  /**
   * Clinic-local day to clean up. Defaults to yesterday + today (so a missed run catches up).
   */
  targetDate?: Date;
  /** Status for queue entries still waiting at close (in-progress entries become 'completed'). */
  queueCompletionStatus?: 'completed' | 'cancelled';
  /** Status for unattended appointments; defaults to 'no-show'. */
  appointmentCompletionStatus?: 'no-show' | 'cancelled' | 'completed';
}

const OPEN_APPOINTMENT_STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled'];
const MAX_APPOINTMENTS = 2000;

async function cleanupTenant(
  tenant: AutomationTenant,
  options: EndOfDayCleanupOptions
): Promise<EndOfDayCleanupResult> {
  const result: EndOfDayCleanupResult = {
    queues: { matched: 0, updated: 0, statuses: ['waiting', 'in-progress'] },
    appointments: { matched: 0, updated: 0, statuses: OPEN_APPOINTMENT_STATUSES },
    errors: [],
    ranAt: new Date(),
  };

  const now = new Date();
  const tz = tenant.timezone;
  const tenantId = tenant.tenantObjectId;

  let rangeStart: Date;
  let rangeEnd: Date;
  if (options.targetDate) {
    ({ start: rangeStart, end: rangeEnd } = dayRangeInTz(options.targetDate, tz));
  } else {
    rangeStart = dayRangeOffsetInTz(-1, now, tz).start;
    rangeEnd = dayRangeInTz(now, tz).end;
  }
  if (rangeEnd > now) rangeEnd = now;

  // 1. Queue entries
  try {
    const base = { tenantId, queuedAt: { $gte: rangeStart, $lte: rangeEnd } };
    const waitingStatus = options.queueCompletionStatus === 'completed' ? 'completed' : 'cancelled';

    const [inProgress, waiting] = await Promise.all([
      Queue.updateMany(
        { ...base, status: 'in-progress' },
        { $set: { status: 'completed', completedAt: now, completionNotes: 'Auto-closed by end-of-day cleanup' } }
      ),
      Queue.updateMany(
        { ...base, status: 'waiting' },
        { $set: { status: waitingStatus, completionNotes: 'Auto-closed by end-of-day cleanup (not seen)' } }
      ),
    ]);
    result.queues.matched = (inProgress.matchedCount ?? 0) + (waiting.matchedCount ?? 0);
    result.queues.updated = (inProgress.modifiedCount ?? 0) + (waiting.modifiedCount ?? 0);
  } catch (err: unknown) {
    const msg = errorMessage(err);
    console.error('[EndOfDayCleanup] Queue cleanup error:', msg);
    result.errors.push(`Queue cleanup: ${msg}`);
  }

  // 2. Appointments whose time has passed and were never closed
  try {
    const unattendedStatus = options.appointmentCompletionStatus ?? 'no-show';
    const appointments = await Appointment.find({
      tenantId,
      status: { $in: OPEN_APPOINTMENT_STATUSES },
      $or: [
        { appointmentDate: { $gte: rangeStart, $lte: rangeEnd } },
        { scheduledAt: { $gte: rangeStart, $lte: rangeEnd } },
      ],
    })
      .select('_id patient appointmentDate appointmentTime scheduledAt duration')
      .limit(MAX_APPOINTMENTS)
      .lean();

    for (const appt of appointments as any[]) {
      try {
        const startsAt: Date = appt.scheduledAt
          ? new Date(appt.scheduledAt)
          : combineDateAndTimeInTz(appt.appointmentDate, appt.appointmentTime || '23:59', tz);
        const endsAt = new Date(startsAt.getTime() + (appt.duration || 30) * 60 * 1000);
        if (endsAt > now) continue;
        result.appointments.matched++;

        const { start, end } = dayRangeInTz(startsAt, tz);
        const [servedInQueue, visit] = await Promise.all([
          Queue.exists({ tenantId, appointment: appt._id, status: { $in: ['completed', 'in-progress'] } }),
          Visit.exists({ tenantId, patient: appt.patient, date: { $gte: start, $lte: end } }),
        ]);
        const status = servedInQueue || visit ? 'completed' : unattendedStatus;

        const res = await Appointment.updateOne(
          { _id: appt._id, tenantId, status: { $in: OPEN_APPOINTMENT_STATUSES } },
          { $set: { status } }
        );
        result.appointments.updated += res.modifiedCount ?? 0;
      } catch (err) {
        result.errors.push(`Appointment ${appt._id}: ${errorMessage(err)}`);
      }
    }
  } catch (err: unknown) {
    const msg = errorMessage(err);
    console.error('[EndOfDayCleanup] Appointment cleanup error:', msg);
    result.errors.push(`Appointment cleanup: ${msg}`);
  }

  return result;
}

/**
 * End-of-day cleanup – closes open queue entries and unattended appointments.
 */
export async function runEndOfDayCleanup(
  options: EndOfDayCleanupOptions = {}
): Promise<EndOfDayCleanupResult> {
  await connectDB();

  const total: EndOfDayCleanupResult = {
    queues: { matched: 0, updated: 0, statuses: ['waiting', 'in-progress'] },
    appointments: { matched: 0, updated: 0, statuses: OPEN_APPOINTMENT_STATUSES },
    errors: [],
    ranAt: new Date(),
  };

  const runs = await forEachTenant(options.tenantId, (t) => cleanupTenant(t, options));
  for (const run of runs) {
    if (!run.result) {
      total.errors.push(`Tenant ${run.tenantId}: ${run.error}`);
      continue;
    }
    total.queues.matched += run.result.queues.matched;
    total.queues.updated += run.result.queues.updated;
    total.appointments.matched += run.result.appointments.matched;
    total.appointments.updated += run.result.appointments.updated;
    total.errors.push(...run.result.errors.map((e) => `Tenant ${run.tenantId}: ${e}`));
  }
  return total;
}
