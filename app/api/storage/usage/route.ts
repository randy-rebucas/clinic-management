import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { getStorageUsageSummary, calculateStorageUsage } from '@/lib/storage-tracking';

/**
 * Get storage usage for the current tenant
 * GET /api/storage/usage
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

    const summary = await getStorageUsageSummary(tenantId);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Error getting storage usage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get storage usage' },
      { status: 500 }
    );
  }
}

