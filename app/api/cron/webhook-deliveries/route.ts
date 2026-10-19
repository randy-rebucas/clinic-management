import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processDueDeliveries } from '@/lib/webhooks';

export const maxDuration = 300;

/**
 * Retries webhook deliveries that are due (backoff 1 min → 12 h, 7 attempts), and sends any
 * first attempt the request that queued it did not get to.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const data = await processDueDeliveries();
    return NextResponse.json({ success: true, message: 'Webhook deliveries processed', data });
  } catch (error) {
    console.error('[Cron] webhook-deliveries error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process webhook deliveries' }, { status: 500 });
  }
}
