import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { runEndOfDayCleanup } from '@/lib/automations/end-of-day-cleanup';
import { combineDateAndTimeInTz } from '@/lib/tz';

export const maxDuration = 300;

/**
 * End-of-Day Cleanup Cron Job (every active tenant, clinic-local days)
 *
 * - In-progress queue entries → completed; waiting entries → cancelled.
 * - Appointments whose time has passed and were never closed → completed if the patient
 *   was seen (queue/visit), otherwise no-show. Later appointments are never touched.
 *
 * Manual trigger:
 *   GET /api/cron/end-of-day-cleanup
 *   GET /api/cron/end-of-day-cleanup?date=2025-03-15            (specific clinic-local date)
 *   GET /api/cron/end-of-day-cleanup?queueStatus=completed       (waiting entries → completed)
 *   GET /api/cron/end-of-day-cleanup?appointmentStatus=cancelled (unattended → cancelled)
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const searchParams = request.nextUrl.searchParams;

    const dateParam = searchParams.get('date');
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ success: false, error: 'date must be yyyy-MM-dd' }, { status: 400 });
    }
    // Noon (Manila) on that date falls inside the same calendar day for any +/- 11h clinic zone.
    const targetDate = dateParam ? combineDateAndTimeInTz(dateParam, '12:00') : undefined;

    const queueStatus = searchParams.get('queueStatus') === 'completed' ? 'completed' : 'cancelled';
    const rawApptStatus = searchParams.get('appointmentStatus');
    const appointmentStatus = rawApptStatus === 'cancelled' ? 'cancelled' : 'no-show';

    const result = await runEndOfDayCleanup({
      targetDate,
      queueCompletionStatus: queueStatus,
      appointmentCompletionStatus: appointmentStatus,
    });

    const hasErrors = result.errors.length > 0;

    return NextResponse.json(
      {
        success: !hasErrors,
        message: hasErrors
          ? 'End-of-day cleanup completed with errors'
          : 'End-of-day cleanup completed successfully',
        data: {
          targetDate: dateParam || null,
          queues: {
            matched: result.queues.matched,
            updated: result.queues.updated,
            closedAs: queueStatus,
          },
          appointments: {
            matched: result.appointments.matched,
            updated: result.appointments.updated,
            closedAs: appointmentStatus,
          },
          errors: result.errors,
          ranAt: result.ranAt,
        },
      },
      { status: hasErrors ? 207 : 200 }
    );
  } catch (error) {
    console.error('[Cron] end-of-day-cleanup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to run end-of-day cleanup' }, { status: 500 });
  }
}
