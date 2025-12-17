import { NextRequest, NextResponse } from 'next/server';
import { processNoShows } from '@/lib/automations/no-show-handling';

// This endpoint should be called by a cron job service (e.g., Vercel Cron, cron-job.org, etc.)
// For security, you should add authentication via a secret token
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
    const result = await processNoShows();

    return NextResponse.json({
      success: true,
      message: 'No-show handling processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing no-show handling:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process no-show handling' },
      { status: 500 }
    );
  }
}

