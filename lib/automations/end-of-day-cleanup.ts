// End-of-Day Cleanup Automation
// Automatically marks all active queue entries and pending/scheduled appointments
// as "completed" at the end of each clinic day (runs at 6:00 PM).

import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import { Types } from 'mongoose';

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
  /** Scope cleanup to a specific tenant. Omit to run across all tenants. */
  tenantId?: Types.ObjectId | string;
  /**
   * Date to clean up (defaults to today). Useful for back-filling or testing.
   */
  targetDate?: Date;
  /** Override the "completed" status for queue entries. */
  queueCompletionStatus?: 'completed' | 'cancelled';
  /** Override the "completed" status for appointments. */
  appointmentCompletionStatus?: 'completed' | 'cancelled';
}

/**
 * Returns a [start, end] tuple representing 00:00:00 – 23:59:59 for the given date.
 */
function dayRange(date: Date): [Date, Date] {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return [start, end];
}

/**
 * End-of-day cleanup – closes all open queue entries and pending appointments.
 */
export async function runEndOfDayCleanup(
  options: EndOfDayCleanupOptions = {}
): Promise<EndOfDayCleanupResult> {
  await connectDB();

  const result: EndOfDayCleanupResult = {
    queues: { matched: 0, updated: 0, statuses: [] },
    appointments: { matched: 0, updated: 0, statuses: [] },
    errors: [],
    ranAt: new Date(),
  };

  const targetDate = options.targetDate ?? new Date();
  const [dayStart, dayEnd] = dayRange(targetDate);

  const queueStatus = options.queueCompletionStatus ?? 'completed';
  const appointmentStatus = options.appointmentCompletionStatus ?? 'completed';

  // ── Tenant filter ───────────────────────────────────────────────────────────
  const tenantFilter: Record<string, unknown> = {};
  if (options.tenantId) {
    tenantFilter.tenantId =
      typeof options.tenantId === 'string'
        ? new Types.ObjectId(options.tenantId)
        : options.tenantId;
  }

  // ── 1. Clean up Queue entries ───────────────────────────────────────────────
  try {
    // Active statuses that should be closed at end of day
    const activeQueueStatuses: string[] = ['waiting', 'in-progress'];

    const queueFilter = {
      ...tenantFilter,
      status: { $in: activeQueueStatuses },
      queuedAt: { $gte: dayStart, $lte: dayEnd },
    };

    // Count before updating
    result.queues.matched = await Queue.countDocuments(queueFilter);
    result.queues.statuses = activeQueueStatuses;

    if (result.queues.matched > 0) {
      const queueUpdate = await Queue.updateMany(queueFilter, {
        $set: {
          status: queueStatus,
          completedAt: new Date(),
          completionNotes: 'Auto-closed by end-of-day cleanup',
          updatedAt: new Date(),
        },
      });

      result.queues.updated = queueUpdate.modifiedCount ?? 0;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EndOfDayCleanup] Queue cleanup error:', msg);
    result.errors.push(`Queue cleanup: ${msg}`);
  }

  // ── 2. Clean up Appointments ────────────────────────────────────────────────
  try {
    // Statuses that represent "still pending" at end of day
    const activeApptStatuses: string[] = ['pending', 'scheduled', 'confirmed'];

    // Support both date field formats used in the Appointment model
    const apptFilter = {
      ...tenantFilter,
      status: { $in: activeApptStatuses },
      $or: [
        // Original format: appointmentDate field
        { appointmentDate: { $gte: dayStart, $lte: dayEnd } },
        // Extended format: scheduledAt field
        { scheduledAt: { $gte: dayStart, $lte: dayEnd } },
      ],
    };

    result.appointments.matched = await Appointment.countDocuments(apptFilter);
    result.appointments.statuses = activeApptStatuses;

    if (result.appointments.matched > 0) {
      const apptUpdate = await Appointment.updateMany(apptFilter, {
        $set: {
          status: appointmentStatus,
          updatedAt: new Date(),
        },
      });

      result.appointments.updated = apptUpdate.modifiedCount ?? 0;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EndOfDayCleanup] Appointment cleanup error:', msg);
    result.errors.push(`Appointment cleanup: ${msg}`);
  }

  return result;
}
