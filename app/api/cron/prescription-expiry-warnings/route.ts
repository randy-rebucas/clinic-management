import { NextRequest, NextResponse } from 'next/server';
import { processPrescriptionExpiryWarnings } from '@/lib/automations/prescription-expiry-warnings';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to send prescription expiry warnings
 * Runs daily at 8:00 AM
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
    
    const result = await processPrescriptionExpiryWarnings(tenantId);
    
    return NextResponse.json({
      success: result.success,
      message: 'Prescription expiry warnings processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in prescription expiry warnings cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process prescription expiry warnings' },
      { status: 500 }
    );
  }
}
