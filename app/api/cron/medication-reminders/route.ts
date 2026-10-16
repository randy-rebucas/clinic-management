import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processMedicationReminders } from '@/lib/automations/medication-adherence';

export const maxDuration = 300;

/**
 * Sends medication reminders for the current clinic-local slot (08/12/14/16/20).
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processMedicationReminders();
    return NextResponse.json({
      success: result.success,
      message: 'Medication reminders processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] medication-reminders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process medication-reminders' }, { status: 500 });
  }
}
