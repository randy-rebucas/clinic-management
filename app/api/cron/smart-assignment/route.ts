import { NextRequest, NextResponse } from 'next/server';
import { processUnassignedAppointments } from '@/lib/automations/smart-assignment';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to automatically assign doctors to unassigned appointments
 * Runs hourly
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
    
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'No tenant context found' },
        { status: 400 }
      );
    }
    
    const result = await processUnassignedAppointments(tenantId);
    
    return NextResponse.json({
      success: result.success,
      message: 'Smart appointment assignment processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in smart assignment cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process smart assignment' },
      { status: 500 }
    );
  }
}
