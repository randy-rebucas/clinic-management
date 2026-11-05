import { NextRequest, NextResponse } from 'next/server';
import { requireCron } from '@/lib/cron-auth';
import { cleanupUnpaidRepSignups } from '@/lib/automations/medrep-signup-cleanup';

export const maxDuration = 300;

/** Daily: remove public medical rep signups that never paid. */
export async function GET(request: NextRequest) {
  const denied = requireCron(request);
  if (denied) return denied;

  try {
    return NextResponse.json({ success: true, ...(await cleanupUnpaidRepSignups()) });
  } catch (error) {
    console.error('Error cleaning up unpaid rep signups:', error);
    return NextResponse.json({ success: false, error: 'Cleanup failed' }, { status: 500 });
  }
}
