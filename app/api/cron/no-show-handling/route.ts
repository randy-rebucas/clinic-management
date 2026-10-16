import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processNoShows } from '@/lib/automations/no-show-handling';

export const maxDuration = 300;

/**
 * Marks unattended appointments as no-show and offers rescheduling.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processNoShows();
    return NextResponse.json({
      success: result.success,
      message: 'No-shows processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] no-show-handling error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process no-show-handling' }, { status: 500 });
  }
}
