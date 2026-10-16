import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { optimizeQueue, optimizeQueueScheduling } from '@/lib/automations/queue-optimization';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';

/**
 * Optimize queue manually
 * POST /api/queue/optimize
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  // Only admins or queue managers can optimize
  const permissionCheck = await requirePermission(ctx.session, 'queue', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const result = await optimizeQueue(ctx.tenantId);
    const schedulingRecommendations = await optimizeQueueScheduling(ctx.tenantId);

    return NextResponse.json({
      success: result.optimized,
      data: {
        optimization: result,
        recommendations: schedulingRecommendations,
      },
    });
  } catch (error: any) {
    console.error('Error optimizing queue:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to optimize queue' },
      { status: 500 }
    );
  }
}

/**
 * Get queue optimization recommendations
 * GET /api/queue/optimize
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'queue', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const recommendations = await optimizeQueueScheduling(ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: recommendations,
    });
  } catch (error: any) {
    console.error('Error getting queue recommendations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get recommendations' },
      { status: 500 }
    );
  }
}
