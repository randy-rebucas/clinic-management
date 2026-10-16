import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processFeedbackCollection } from '@/lib/automations/feedback-collection';

export const maxDuration = 300;

/**
 * Requests feedback for recently closed visits for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processFeedbackCollection();
    return NextResponse.json({
      success: result.success,
      message: 'Feedback collection processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] feedback-collection error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process feedback-collection' }, { status: 500 });
  }
}
