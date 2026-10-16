import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { optimizeQueue, optimizeQueueScheduling } from '@/lib/automations/queue-optimization';
import { forEachTenant } from '@/lib/automations/shared';

export const maxDuration = 300;

/**
 * Queue optimization for every active tenant (only where autoQueueOptimization is on).
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const runs = await forEachTenant(null, async (tenant) => ({
      optimization: await optimizeQueue(tenant.tenantId),
      scheduling: await optimizeQueueScheduling(tenant.tenantId),
    }));

    return NextResponse.json({
      success: runs.every((r) => r.success),
      message: `Queue optimization processed for ${runs.length} tenant(s)`,
      data: runs.map((r) => ({
        tenantId: r.tenantId,
        success: r.success,
        changes: r.result?.optimization.changes.length ?? 0,
      })),
    });
  } catch (error) {
    console.error('[Cron] queue-optimization error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process queue optimization' }, { status: 500 });
  }
}
