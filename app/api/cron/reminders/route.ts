import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processDayBeforeReminders } from '@/lib/automations/appointment-reminders';

export const maxDuration = 300;

/**
 * Day-before SMS reminders for appointments and follow-up visits (tomorrow, clinic-local),
 * for every active tenant. Each record is reminded once (Appointment.reminderSentAt /
 * Visit.followUpReminderSent).
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const data = await processDayBeforeReminders();
    return NextResponse.json({
      success: data.errors.length === 0,
      message: 'Reminders processed',
      data,
    });
  } catch (error) {
    console.error('[Cron] reminders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process reminders' }, { status: 500 });
  }
}
