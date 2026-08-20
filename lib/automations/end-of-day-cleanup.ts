// End-of-Day Cleanup Automation
// Automatically marks all active queue entries and pending/scheduled appointments
// as "completed" at the end of each clinic day (runs at 6:00 PM).

import type { AppointmentStatus } from '@prisma/client';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { countQueueInDayRange, bulkCloseQueueInDayRange } from '@/lib/data/queue';
import { countAppointmentsInDayRange, bulkCloseAppointmentsInDayRange } from '@/lib/data/appointment';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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
  tenantId?: string;
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

  const tenantId = options.tenantId ?? null;

  // ── 1. Clean up Queue entries ───────────────────────────────────────────────
  try {
    // Active statuses that should be closed at end of day
    const activeQueueStatuses: string[] = ['waiting', 'in-progress'];

    const queueFilter = { dayStart, dayEnd, statuses: activeQueueStatuses };

    result.queues.matched = await run(tenantId, () => countQueueInDayRange(queueFilter));
    result.queues.statuses = activeQueueStatuses;

    if (result.queues.matched > 0) {
      result.queues.updated = await run(tenantId, () => bulkCloseQueueInDayRange(queueFilter, queueStatus));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EndOfDayCleanup] Queue cleanup error:', msg);
    result.errors.push(`Queue cleanup: ${msg}`);
  }

  // ── 2. Clean up Appointments ────────────────────────────────────────────────
  try {
    // Statuses that represent "still pending" at end of day
    const activeApptStatuses: AppointmentStatus[] = ['pending', 'scheduled', 'confirmed'];

    const apptFilter = { dayStart, dayEnd, statuses: activeApptStatuses };

    result.appointments.matched = await run(tenantId, () => countAppointmentsInDayRange(apptFilter));
    result.appointments.statuses = activeApptStatuses;

    if (result.appointments.matched > 0) {
      result.appointments.updated = await run(tenantId, () =>
        bulkCloseAppointmentsInDayRange(apptFilter, appointmentStatus as AppointmentStatus)
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EndOfDayCleanup] Appointment cleanup error:', msg);
    result.errors.push(`Appointment cleanup: ${msg}`);
  }

  return result;
}
