import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { processMedrepReminders } from '@/lib/automations/medrep-reminders';
import { sendSponsorshipRenewalReminders } from '@/lib/clinic-sponsorship';

export const maxDuration = 300;

/**
 * Push reminders to medical representatives' mobile app: upcoming visits and products
 * nearing expiry, and clinic sponsorships about to run out. Schedule: see vercel.json. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    const result = await processMedrepReminders();
    let sponsorshipReminders = 0;
    try {
      sponsorshipReminders = await sendSponsorshipRenewalReminders();
    } catch (error) {
      result.success = false;
      result.errors.push(`sponsorship renewals: ${error instanceof Error ? error.message : String(error)}`);
    }
    return NextResponse.json({
      success: result.success,
      message: 'Medical representative reminders processed',
      data: { ...result, sponsorshipReminders },
    });
  } catch (error) {
    console.error('[Cron] medrep-reminders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process medrep-reminders' }, { status: 500 });
  }
}
