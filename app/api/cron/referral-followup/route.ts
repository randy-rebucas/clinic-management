import { NextRequest, NextResponse } from 'next/server';
import { processReferralFollowUps } from '@/lib/automations/referral-followup';
import { getTenantContext } from '@/lib/tenant';

/**
 * Referral Follow-Up Cron Job
 *
 * - Sends reminders to patients for referrals whose follow-up date is
 *   within the next 3 days.
 * - Escalates urgent/stat referrals that have been pending 7+ days.
 *
 * Schedule: 0 9 * * *  →  09:00 UTC = 17:00 PHT daily.
 */
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    let tenantId: string | undefined;
    try {
      const tenantContext = await getTenantContext();
      if (tenantContext.tenantId) {
        tenantId = tenantContext.tenantId as string;
      }
    } catch {
      // single-tenant mode
    }

    const result = await processReferralFollowUps(tenantId);

    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Referral follow-up processed',
      data: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] referral-followup error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
