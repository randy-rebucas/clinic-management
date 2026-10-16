import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processMonthlyStaffPerformance } from '@/lib/automations/staff-performance';

export const maxDuration = 300;

/**
 * Emails each tenant staff performance for the previous calendar month.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processMonthlyStaffPerformance();
    return NextResponse.json({
      success: result.success,
      message: 'Monthly staff performance processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] monthly-staff-performance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process monthly-staff-performance' }, { status: 500 });
  }
}
