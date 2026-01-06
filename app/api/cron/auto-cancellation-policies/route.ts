import { NextRequest, NextResponse } from 'next/server';
import { processAutoCancellationPolicies } from '@/lib/automations/auto-cancellation-policies';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to apply auto-cancellation policies for chronic no-shows
 * Runs daily at 10:00 AM
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

    // Ensure we have a tenant for this cron run
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 400 }
      );
    }
    
    const result = await processAutoCancellationPolicies(tenantId);
    
    return NextResponse.json({
      success: result.success,
      message: 'Auto-cancellation policies processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in auto-cancellation policies cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process auto-cancellation policies' },
      { status: 500 }
    );
  }
}
