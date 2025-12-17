import { NextRequest, NextResponse } from 'next/server';
import { sendDailyReport } from '@/lib/automations/daily-reports';

// This endpoint should be called by a cron job service (e.g., Vercel Cron, cron-job.org, etc.)
// For security, you should add authentication via a secret token
// Typically runs at end of day (e.g., 11:00 PM) to report on the day's activities
export async function GET(request: NextRequest) {
  // Authenticate request
  // Vercel Cron sends 'x-vercel-cron' header for internal authentication
  // External cron services should use 'Authorization: Bearer CRON_SECRET'
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // If CRON_SECRET is set, require authentication (unless it's Vercel Cron)
  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  try {
    // Get date from query params or use yesterday (since this runs at end of day)
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    const reportDate = dateParam ? new Date(dateParam) : new Date();

    const result = await sendDailyReport({
      date: reportDate,
      sendEmail: true,
    });

    return NextResponse.json({
      success: true,
      message: 'Daily report processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing daily report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process daily report' },
      { status: 500 }
    );
  }
}

