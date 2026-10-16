import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getStorageUsageSummary } from '@/lib/storage-tracking';

/**
 * Get storage usage for the current tenant
 * GET /api/storage/usage
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'settings', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const summary = await getStorageUsageSummary(ctx.tenantId);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error getting storage usage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get storage usage' },
      { status: 500 }
    );
  }
}
