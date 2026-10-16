import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processWeeklyReports } from '@/lib/automations/periodic-reports';

export const maxDuration = 300;

/**
 * Emails each tenant the report for the previous Monday–Sunday week.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processWeeklyReports();
    return NextResponse.json({
      success: result.success,
      message: 'Weekly reports processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] weekly-reports error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process weekly-reports' }, { status: 500 });
  }
}
