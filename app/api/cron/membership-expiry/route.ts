import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { sendMembershipExpiryReminders } from '@/lib/automations/membership-expiry';

export const maxDuration = 300;

/**
 * Membership renewal reminders (30/14/7/3/1 days) and auto-expiry for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await sendMembershipExpiryReminders();
    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Membership expiry processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] membership-expiry error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process membership-expiry' }, { status: 500 });
  }
}
