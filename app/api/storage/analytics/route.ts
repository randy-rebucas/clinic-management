import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getStorageAnalytics } from '@/lib/storage-optimization';

/**
 * Get storage analytics and trends
 * GET /api/storage/analytics
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'settings', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const analytics = await getStorageAnalytics(ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Error getting storage analytics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get storage analytics' },
      { status: 500 }
    );
  }
}
