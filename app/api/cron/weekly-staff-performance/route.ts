import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processWeeklyStaffPerformance } from '@/lib/automations/staff-performance';

export const maxDuration = 300;

/**
 * Emails each tenant staff performance for the previous Monday–Sunday week.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processWeeklyStaffPerformance();
    return NextResponse.json({
      success: result.success,
      message: 'Weekly staff performance processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] weekly-staff-performance error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process weekly-staff-performance' }, { status: 500 });
  }
}
