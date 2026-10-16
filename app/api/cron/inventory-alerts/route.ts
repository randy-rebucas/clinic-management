import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processInventoryAlerts } from '@/lib/automations/inventory-alerts';

export const maxDuration = 300;

/**
 * Alerts staff about low/out-of-stock/expired inventory for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processInventoryAlerts();
    return NextResponse.json({
      success: result.success,
      message: 'Inventory alerts processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] inventory-alerts error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process inventory-alerts' }, { status: 500 });
  }
}
