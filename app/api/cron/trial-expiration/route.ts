import { NextRequest, NextResponse } from 'next/server';
import { processExpiredTrials, sendTrialExpirationWarnings } from '@/lib/automations/trial-expiration';

// This endpoint should be called by a cron job service (e.g., Vercel Cron)
// Runs daily to check for expired trials and send warnings
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
    // Process expired trials
    const expiredResult = await processExpiredTrials();
    
    // Send warnings for trials expiring soon
    const warningsResult = await sendTrialExpirationWarnings();

    return NextResponse.json({
      success: true,
      message: 'Trial expiration processed',
      data: {
        expired: expiredResult,
        warnings: warningsResult,
      },
    });
  } catch (error: any) {
    console.error('Error processing trial expiration:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process trial expiration' },
      { status: 500 }
    );
  }
}

