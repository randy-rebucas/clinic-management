import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processPrescriptionExpiryWarnings } from '@/lib/automations/prescription-expiry-warnings';

export const maxDuration = 300;

/**
 * Warns patients 7/3/1 days before a prescription ends, for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processPrescriptionExpiryWarnings();
    return NextResponse.json({
      success: result.success,
      message: 'Prescription expiry warnings processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] prescription-expiry-warnings error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process prescription-expiry-warnings' }, { status: 500 });
  }
}
