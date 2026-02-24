import { NextRequest, NextResponse } from 'next/server';
import { processVisitFollowUpReminders } from '@/lib/automations/visit-followup';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Visit Follow-Up Reminder Cron Job
 *
 * Sends reminders to patients whose treatmentPlan follow-up date is
 * within the next 2 days and where the reminder has not yet been sent.
 *
 * Schedule: 0 8 * * *  →  08:00 UTC = 16:00 PHT daily.
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
    let tenantId: Types.ObjectId | undefined;
    try {
      const tenantContext = await getTenantContext();
      if (tenantContext.tenantId) {
        tenantId = new Types.ObjectId(tenantContext.tenantId as string);
      }
    } catch {
      // single-tenant mode
    }

    const result = await processVisitFollowUpReminders(tenantId);

    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Visit follow-up reminders processed',
      data: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] visit-followup error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
