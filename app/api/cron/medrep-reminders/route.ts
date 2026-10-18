import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processMedrepReminders } from '@/lib/automations/medrep-reminders';

export const maxDuration = 300;

/**
 * Push reminders to medical representatives' mobile app: upcoming visits and products
 * nearing expiry. Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processMedrepReminders();
    return NextResponse.json({
      success: result.success,
      message: 'Medical representative reminders processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] medrep-reminders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process medrep-reminders' }, { status: 500 });
  }
}
