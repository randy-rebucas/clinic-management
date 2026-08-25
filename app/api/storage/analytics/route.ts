import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { getStorageAnalytics } from '@/lib/storage-optimization';

/**
 * Get storage analytics and trends
 * GET /api/storage/analytics
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const analytics = await getStorageAnalytics(tenantId);

    return NextResponse.json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error('Error getting storage analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get storage analytics' },
      { status: 500 }
    );
  }
}

