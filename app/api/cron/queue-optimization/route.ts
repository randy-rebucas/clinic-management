import { NextRequest, NextResponse } from 'next/server';
import { optimizeQueue, optimizeQueueScheduling } from '@/lib/automations/queue-optimization';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to optimize queue
 * Runs every 15 minutes
 */
export async function GET(request: NextRequest) {
  // Authenticate request
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    if (!tenantId) {
      // Process for all tenants
      const result = await optimizeQueue('' as any);
      return NextResponse.json({
        success: true,
        message: 'Queue optimization processed',
        data: result,
      });
    }

    const result = await optimizeQueue(tenantId);
    const schedulingRecommendations = await optimizeQueueScheduling(tenantId);

    return NextResponse.json({
      success: true,
      message: 'Queue optimization processed',
      data: {
        optimization: result,
        scheduling: schedulingRecommendations,
      },
    });
  } catch (error: any) {
    console.error('Error in queue optimization cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process queue optimization' },
      { status: 500 }
    );
  }
}

