import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processExpiryAlerts } from '@/lib/automations/expiry-monitoring';

export const maxDuration = 300;

/**
 * Alerts staff about expiring inventory for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processExpiryAlerts();
    return NextResponse.json({
      success: result.success,
      message: 'Expiry alerts processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] expiry-monitoring error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process expiry-monitoring' }, { status: 500 });
  }
}
