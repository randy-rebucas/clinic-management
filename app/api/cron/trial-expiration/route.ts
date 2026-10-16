import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processExpiredTrials, sendTrialExpirationWarnings } from '@/lib/automations/trial-expiration';

export const maxDuration = 300;

/**
 * Expires past-due trials and warns tenants whose trial ends within 3 days (3 and 1 day, once each).
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const expiredResult = await processExpiredTrials();
    const warningsResult = await sendTrialExpirationWarnings();

    return NextResponse.json({
      success: expiredResult.success && warningsResult.success,
      message: 'Trial expiration processed',
      data: {
        expired: expiredResult,
        warnings: warningsResult,
      },
    });
  } catch (error) {
    console.error('[Cron] trial-expiration error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process trial expiration' }, { status: 500 });
  }
}
