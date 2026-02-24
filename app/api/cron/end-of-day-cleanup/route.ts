import { NextRequest, NextResponse } from 'next/server';
import { runEndOfDayCleanup } from '@/lib/automations/end-of-day-cleanup';
import { getTenantContext } from '@/lib/tenant';

/**
 * End-of-Day Cleanup Cron Job
 *
 * Marks all active queue entries (waiting / in-progress) and pending/scheduled
 * appointments for the current day as "completed".
 *
 * Schedule: 0 10 * * *  →  10:00 UTC = 18:00 PHT (UTC+8) every day.
 *
 * Manual trigger:
 *   GET /api/cron/end-of-day-cleanup
 *   GET /api/cron/end-of-day-cleanup?date=2025-03-15          (specific date)
 *   GET /api/cron/end-of-day-cleanup?queueStatus=cancelled    (override status)
 *   GET /api/cron/end-of-day-cleanup?appointmentStatus=cancelled
 *
 * Authentication:
 *   Vercel Cron sends the `x-vercel-cron: 1` header automatically.
 *   External callers must supply `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    // Optional: override target date (ISO string, e.g. "2025-03-15")
    const dateParam = searchParams.get('date');
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    // Optional: override completion status
    const rawQueueStatus = searchParams.get('queueStatus');
    const queueStatus =
      rawQueueStatus === 'cancelled' ? 'cancelled' : 'completed';

    const rawApptStatus = searchParams.get('appointmentStatus');
    const appointmentStatus =
      rawApptStatus === 'cancelled' ? 'cancelled' : 'completed';

    // Resolve tenant (no-op for single-tenant deployments)
    let tenantId: string | undefined;
    try {
      const tenantContext = await getTenantContext();
      tenantId = tenantContext.tenantId?.toString();
    } catch {
      // Continue without tenant scoping (single-tenant mode)
    }

    const result = await runEndOfDayCleanup({
      tenantId,
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
          targetDate: targetDate.toISOString().split('T')[0],
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] end-of-day-cleanup error:', msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
