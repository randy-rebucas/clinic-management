import { NextRequest, NextResponse } from 'next/server';
import { processDataRetentionForAllTenants, applyDataRetentionPolicy } from '@/lib/automations/data-retention';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to apply data retention policies
 * Runs weekly on Sunday at 2:00 AM
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

    let result;

    if (tenantId) {
      // Process for specific tenant
      result = await applyDataRetentionPolicy(tenantId);
    } else {
      // Process for all tenants
      result = await processDataRetentionForAllTenants();
    }

    return NextResponse.json({
      success: result.success,
      message: 'Data retention policy applied',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in data retention cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process data retention' },
      { status: 500 }
    );
  }
}

