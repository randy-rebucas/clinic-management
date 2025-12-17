import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { applyDataRetentionPolicy, getDefaultRetentionPolicies } from '@/lib/automations/data-retention';

/**
 * Apply data retention policy
 * POST /api/data-retention/apply
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can apply retention policies
  const permissionCheck = await requirePermission(session, 'settings', 'write');
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

    const body = await request.json();
    const { policies } = body;

    const result = await applyDataRetentionPolicy(
      tenantId,
      policies || getDefaultRetentionPolicies()
    );

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error: any) {
    console.error('Error applying data retention policy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply retention policy' },
      { status: 500 }
    );
  }
}

