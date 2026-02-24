import { NextRequest, NextResponse } from 'next/server';
import { sendMembershipExpiryReminders } from '@/lib/automations/membership-expiry';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Membership Expiry Cron Job
 *
 * - Sends renewal reminders at 30 / 14 / 7 / 3 / 1 days before expiry.
 * - Auto-marks past-due active memberships as "expired".
 *
 * Schedule: 0 8 * * *  →  08:00 UTC = 16:00 PHT daily.
 */
export async function GET(request: NextRequest) {
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    let tenantId: Types.ObjectId | undefined;
    try {
      const tenantContext = await getTenantContext();
      if (tenantContext.tenantId) {
        tenantId = new Types.ObjectId(tenantContext.tenantId as string);
      }
    } catch {
      // single-tenant mode
    }

    const result = await sendMembershipExpiryReminders(tenantId);

    return NextResponse.json({
      success: result.errors.length === 0,
      message: 'Membership expiry processed',
      data: result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron] membership-expiry error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
