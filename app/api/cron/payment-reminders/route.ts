import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processPaymentReminders } from '@/lib/automations/payment-reminders';

export const maxDuration = 300;

/**
 * Sends overdue invoice reminders (7/14/30 days, then weekly) for every active tenant.
 * Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processPaymentReminders();
    return NextResponse.json({
      success: result.success,
      message: 'Payment reminders processed',
      data: result,
    });
  } catch (error) {
    console.error('[Cron] payment-reminders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process payment-reminders' }, { status: 500 });
  }
}
