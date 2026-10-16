import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processWaitlistFills } from '@/lib/automations/waitlist-management';

export const maxDuration = 300;

/**
 * Offers freed (cancelled) slots to waitlisted patients for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processWaitlistFills();
    return NextResponse.json({
      success: result.success,
      message: 'Waitlist fills processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] waitlist-management error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process waitlist-management' }, { status: 500 });
  }
}
