import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { getSubscriptionUsage } from '@/lib/subscription-limits';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations } from '@/lib/subscription-packages';
import { getStorageUsageSummary } from '@/lib/storage-tracking';

/**
 * Get subscription usage statistics
 * Returns current usage vs limits for the tenant's subscription plan
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get subscription status
    const subscriptionStatus = await checkSubscriptionStatus(tenantId);
    
    // Get usage statistics
    const usage = await getSubscriptionUsage(tenantId);
    
    // Get storage usage summary
    const storageSummary = await getStorageUsageSummary(tenantId);
    
    // Get plan limitations
    const limitations = getSubscriptionLimitations(subscriptionStatus.plan);

    return NextResponse.json({
      success: true,
      data: {
        subscription: subscriptionStatus,
        usage,
        storage: storageSummary,
        limitations: {
          maxPatients: limitations.maxPatients,
          maxUsers: limitations.maxUsers,
          maxDoctors: limitations.maxDoctors,
          maxAppointmentsPerMonth: limitations.maxAppointmentsPerMonth,
          maxAppointmentsPerDay: limitations.maxAppointmentsPerDay,
          maxVisitsPerMonth: limitations.maxVisitsPerMonth,
          maxStorageGB: limitations.maxStorageGB,
          maxFileSizeMB: limitations.maxFileSizeMB,
          features: limitations.features,
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting subscription usage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get subscription usage' },
      { status: 500 }
    );
  }
}

