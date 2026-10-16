import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processVisitFollowUpReminders } from '@/lib/automations/visit-followup';

export const maxDuration = 300;

/**
 * Reminds patients of treatment-plan follow-up dates within the next 2 days.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processVisitFollowUpReminders();
    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Visit follow-up reminders processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] visit-followup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process visit-followup' }, { status: 500 });
  }
}
