import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processDocumentExpiryTracking } from '@/lib/automations/document-expiry-tracking';

export const maxDuration = 300;

/**
 * Alerts on expiring patient documents for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processDocumentExpiryTracking();
    return NextResponse.json({
      success: result.success,
      message: 'Document expiry tracking processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] document-expiry-tracking error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process document-expiry-tracking' }, { status: 500 });
  }
}
