import { NextRequest, NextResponse } from 'next/server';
import { processWeeklyStaffPerformance } from '@/lib/automations/staff-performance';

// This endpoint should be called by a cron job service (e.g., Vercel Cron)
// Runs every Monday at 9:00 AM to report on the previous week
export async function GET(request: NextRequest) {
  // Authenticate request
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    const result = await processWeeklyStaffPerformance();

    return NextResponse.json({
      success: true,
      message: 'Weekly staff performance reports processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing weekly staff performance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process weekly staff performance' },
      { status: 500 }
    );
  }
}

