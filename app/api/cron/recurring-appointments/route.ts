import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processRecurringAppointments } from '@/lib/automations/recurring-appointments';

export const maxDuration = 300;

/**
 * Creates the next appointment in recurring series for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processRecurringAppointments();
    return NextResponse.json({
      success: result.success,
      message: 'Recurring appointments processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] recurring-appointments error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process recurring-appointments' }, { status: 500 });
  }
}
