import { NextRequest, NextResponse } from 'next/server';
import { processDocumentExpiryTracking } from '@/lib/automations/document-expiry-tracking';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to track and alert on expiring documents
 * Runs daily at 9:00 AM
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
        { success: false, error: 'Tenant not found' },
        { status: 400 }
      );
    }

    const result = await processDocumentExpiryTracking(tenantId);
    
    return NextResponse.json({
      success: result.success,
      message: 'Document expiry tracking processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in document expiry tracking cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process document expiry tracking' },
      { status: 500 }
    );
  }
}
