import { NextRequest, NextResponse } from 'next/server';
import { optimizeQueue, optimizeQueueScheduling } from '@/lib/automations/queue-optimization';
import { getTenantContext } from '@/lib/tenant';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * Cron job to optimize queue
 * Runs every 15 minutes
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    if (tenantId) {
      // Single-tenant invocation (subdomain-scoped request)
      const [result, schedulingRecommendations] = await Promise.all([
        optimizeQueue(tenantId),
        optimizeQueueScheduling(tenantId),
      ]);

      return NextResponse.json({
        success: true,
        message: 'Queue optimization processed',
        data: { optimization: result, scheduling: schedulingRecommendations },
      });
    }

    // No tenant in context — run for all active tenants
    await connectDB();
    const tenants = await Tenant.find({ status: 'active' }).select('_id').lean<{ _id: import('mongoose').Types.ObjectId }[]>();

    const results = await Promise.allSettled(
      tenants.map(async (t) => {
        const id = t._id.toString();
        const [opt, sched] = await Promise.all([
          optimizeQueue(id),
          optimizeQueueScheduling(id),
        ]);
        return { tenantId: id, optimization: opt, scheduling: sched };
      })
    );

    const summary = results.map((r) =>
      r.status === 'fulfilled'
        ? { tenantId: r.value.tenantId, success: true }
        : { success: false, reason: (r as PromiseRejectedResult).reason?.message }
    );

    return NextResponse.json({
      success: true,
      message: `Queue optimization processed for ${tenants.length} tenant(s)`,
      data: summary,
    });
  } catch (error: any) {
    console.error('Error in queue optimization cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process queue optimization' },
      { status: 500 }
    );
  }
}
