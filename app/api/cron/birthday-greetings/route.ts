import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processBirthdayGreetings } from '@/lib/automations/birthday-greetings';

export const maxDuration = 300;

/**
 * Greets patients on their birthday (clinic-local day) for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processBirthdayGreetings();
    return NextResponse.json({
      success: result.success,
      message: 'Birthday greetings processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] birthday-greetings error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process birthday-greetings' }, { status: 500 });
  }
}
