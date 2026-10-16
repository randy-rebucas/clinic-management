import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processReferralFollowUps } from '@/lib/automations/referral-followup';

export const maxDuration = 300;

/**
 * Referral follow-up reminders and stale-referral escalations for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processReferralFollowUps();
    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Referral follow-ups processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] referral-followup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process referral-followup' }, { status: 500 });
  }
}
