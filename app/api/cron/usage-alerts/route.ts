import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processUsageAlerts } from '@/lib/automations/usage-alerts';

export const maxDuration = 300;

/**
 * Alerts tenant admins when subscription usage crosses 80/90/100%.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processUsageAlerts();
    return NextResponse.json({
      success: result.success,
      message: 'Usage alerts processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] usage-alerts error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process usage-alerts' }, { status: 500 });
  }
}
