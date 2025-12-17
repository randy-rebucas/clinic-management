import { NextRequest, NextResponse } from 'next/server';
import { processFeedbackCollection } from '@/lib/automations/feedback-collection';

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
    const result = await processFeedbackCollection();

    return NextResponse.json({
      success: true,
      message: 'Feedback collection processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error processing feedback collection:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process feedback collection' },
      { status: 500 }
    );
  }
}

