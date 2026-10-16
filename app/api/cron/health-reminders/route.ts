import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processHealthReminders } from '@/lib/automations/health-reminders';

export const maxDuration = 300;

/**
 * Sends preventive-care reminders (at most one per patient per 180 days).
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processHealthReminders();
    return NextResponse.json({
      success: result.success,
      message: 'Health reminders processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] health-reminders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process health-reminders' }, { status: 500 });
  }
}
