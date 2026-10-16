import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processRefillReminders } from '@/lib/automations/prescription-refills';

export const maxDuration = 300;

/**
 * Refill reminders 3/1/0 days before the refill date, for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processRefillReminders();
    return NextResponse.json({
      success: result.success,
      message: 'Prescription refill reminders processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] prescription-refills error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process prescription-refills' }, { status: 500 });
  }
}
