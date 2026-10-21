import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { sendEmcrRenewalReminders } from '@/lib/automations/emcr-renewal';

export const maxDuration = 300;

/**
 * eMCR renewal reminders (30 and 7 days before the year ends, and on the day).
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await sendEmcrRenewalReminders();
    return NextResponse.json({ success: result.errors.length === 0, message: 'eMCR renewal reminders processed', data: result });
  } catch (error) {
    console.error('[Cron] emcr-renewal error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process emcr-renewal' }, { status: 500 });
  }
}
