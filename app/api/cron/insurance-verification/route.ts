import { NextRequest, NextResponse } from 'next/server';
import { verifyInsuranceForUpcomingAppointments } from '@/lib/automations/insurance-verification';
import { getTenantContext } from '@/lib/tenant';

/**
 * Cron job to verify insurance for upcoming appointments
 * Runs daily at 8:00 AM
 */
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
    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;

    const result = await verifyInsuranceForUpcomingAppointments(tenantId?.toString());

    return NextResponse.json({
      success: true,
      message: 'Insurance verification processed',
      data: result,
    });
  } catch (error: any) {
    console.error('Error in insurance verification cron:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process insurance verification' },
      { status: 500 }
    );
  }
}

