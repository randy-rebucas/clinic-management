import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processMonthlyReports } from '@/lib/automations/periodic-reports';

export const maxDuration = 300;

/**
 * Emails each tenant the report for the previous calendar month.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processMonthlyReports();
    return NextResponse.json({
      success: result.success,
      message: 'Monthly reports processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] monthly-reports error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process monthly-reports' }, { status: 500 });
  }
}
