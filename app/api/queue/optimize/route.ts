import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { optimizeQueue, optimizeQueueScheduling } from '@/lib/automations/queue-optimization';

/**
 * Optimize queue manually
 * POST /api/queue/optimize
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins or queue managers can optimize
  const permissionCheck = await requirePermission(session, 'queue', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const result = await optimizeQueue(tenantId);
    const schedulingRecommendations = await optimizeQueueScheduling(tenantId);

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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const recommendations = await optimizeQueueScheduling(tenantId);

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

