import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processDataRetentionForAllTenants } from '@/lib/automations/data-retention';

export const maxDuration = 300;

/**
 * Applies data retention policies for every active tenant (weekly).
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processDataRetentionForAllTenants();
    return NextResponse.json({
      success: result.success,
      message: 'Data retention policy applied',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] data-retention error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process data-retention' }, { status: 500 });
  }
}
