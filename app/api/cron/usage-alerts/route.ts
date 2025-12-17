import { NextRequest, NextResponse } from 'next/server';
import { processUsageAlerts } from '@/lib/automations/usage-alerts';

// This endpoint should be called by a cron job service (e.g., Vercel Cron)
// Runs daily to check usage and send alerts
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
    const result = await processUsageAlerts();

    return NextResponse.json({
      success: true,
      message: 'Usage alerts processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing usage alerts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process usage alerts' },
      { status: 500 }
    );
  }
}

