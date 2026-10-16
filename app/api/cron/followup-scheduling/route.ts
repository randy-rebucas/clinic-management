import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processFollowupScheduling } from '@/lib/automations/followup-scheduling';

export const maxDuration = 300;

/**
 * Books follow-up appointments for closed visits with an upcoming follow-up date.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processFollowupScheduling();
    return NextResponse.json({
      success: result.success,
      message: 'Follow-up scheduling processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] followup-scheduling error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process followup-scheduling' }, { status: 500 });
  }
}
