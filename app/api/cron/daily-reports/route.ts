import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { sendDailyReport } from '@/lib/automations/daily-reports';

export const maxDuration = 300;

/**
 * Emails each tenant's admins/accountants the report for the previous clinic-local day.
 * Optional `?date=yyyy-MM-dd` reports on that clinic-local day instead.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const dateParam = request.nextUrl.searchParams.get('date');
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ success: false, error: 'date must be yyyy-MM-dd' }, { status: 400 });
    }

    const result = await sendDailyReport({
      day: dateParam || undefined,
      sendEmail: true,
    });

    return NextResponse.json({
      success: result.success,
      message: 'Daily report processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] daily-reports error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process daily report' }, { status: 500 });
  }
}
