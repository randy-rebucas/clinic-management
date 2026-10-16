import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processLabNotifications } from '@/lib/automations/lab-notifications';

export const maxDuration = 300;

/**
 * Notifies patients about completed lab results (oldest first, bounded retries).
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processLabNotifications();
    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Lab notifications batch processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] lab-notifications error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process lab-notifications' }, { status: 500 });
  }
}
