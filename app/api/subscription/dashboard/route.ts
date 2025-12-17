import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { getSubscriptionUsage } from '@/lib/subscription-limits';
import { getStorageUsageSummary } from '@/lib/storage-tracking';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations } from '@/lib/subscription-packages';
import { getPlanRecommendations } from '@/lib/plan-recommendations';

/**
 * Get comprehensive usage dashboard data
 * Includes visual statistics, progress bars, and upgrade prompts
 * GET /api/subscription/dashboard
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

    // Calculate progress percentages and warnings
    const calculateProgress = (current: number, limit: number | null) => {
      if (limit === null) return { percentage: 0, warning: false, critical: false };
      const percentage = Math.min(100, (current / limit) * 100);
      return {
        percentage: Math.round(percentage * 100) / 100,
        warning: percentage >= 80 && percentage < 90,
        critical: percentage >= 90,
      };
    };

    // Build dashboard data with progress indicators
    const dashboard = {
      subscription: subscriptionStatus,
      usage: {
        patients: {
          ...usage.patients,
          ...calculateProgress(usage.patients.current, usage.patients.limit),
          progressColor: usage.patients.limit && usage.patients.current / usage.patients.limit >= 0.9 
            ? 'red' 
            : usage.patients.limit && usage.patients.current / usage.patients.limit >= 0.8 
            ? 'yellow' 
            : 'green',
        },
        users: {
          ...usage.users,
          ...calculateProgress(usage.users.current, usage.users.limit),
          progressColor: usage.users.limit && usage.users.current / usage.users.limit >= 0.9 
            ? 'red' 
            : usage.users.limit && usage.users.current / usage.users.limit >= 0.8 
            ? 'yellow' 
            : 'green',
        },
        doctors: {
          ...usage.doctors,
          ...calculateProgress(usage.doctors.current, usage.doctors.limit),
          progressColor: usage.doctors.limit && usage.doctors.current / usage.doctors.limit >= 0.9 
            ? 'red' 
            : usage.doctors.limit && usage.doctors.current / usage.doctors.limit >= 0.8 
            ? 'yellow' 
            : 'green',
        },
        appointmentsThisMonth: {
          ...usage.appointmentsThisMonth,
          ...calculateProgress(usage.appointmentsThisMonth.current, usage.appointmentsThisMonth.limit),
          progressColor: usage.appointmentsThisMonth.limit && usage.appointmentsThisMonth.current / usage.appointmentsThisMonth.limit >= 0.9 
            ? 'red' 
            : usage.appointmentsThisMonth.limit && usage.appointmentsThisMonth.current / usage.appointmentsThisMonth.limit >= 0.8 
            ? 'yellow' 
            : 'green',
        },
        appointmentsToday: {
          ...usage.appointmentsToday,
          ...calculateProgress(usage.appointmentsToday.current, usage.appointmentsToday.limit),
          progressColor: usage.appointmentsToday.limit && usage.appointmentsToday.current / usage.appointmentsToday.limit >= 0.9 
            ? 'red' 
            : usage.appointmentsToday.limit && usage.appointmentsToday.current / usage.appointmentsToday.limit >= 0.8 
            ? 'yellow' 
            : 'green',
        },
        visitsThisMonth: {
          ...usage.visitsThisMonth,
          ...calculateProgress(usage.visitsThisMonth.current, usage.visitsThisMonth.limit),
          progressColor: usage.visitsThisMonth.limit && usage.visitsThisMonth.current / usage.visitsThisMonth.limit >= 0.9 
            ? 'red' 
            : usage.visitsThisMonth.limit && usage.visitsThisMonth.current / usage.visitsThisMonth.limit >= 0.8 
            ? 'yellow' 
            : 'green',
        },
        storage: {
          ...usage.storage,
          ...storageSummary.usage,
          formatted: storageSummary.formatted,
          progressColor: usage.storage.percentageUsed >= 90 
            ? 'red' 
            : usage.storage.percentageUsed >= 80 
            ? 'yellow' 
            : 'green',
          warning: usage.storage.percentageUsed >= 80 && usage.storage.percentageUsed < 90,
          critical: usage.storage.percentageUsed >= 90,
          breakdown: {
            documents: {
              bytes: storageSummary.usage.documentsBytes,
              formatted: formatBytes(storageSummary.usage.documentsBytes),
              percentage: storageSummary.usage.totalBytes > 0 
                ? (storageSummary.usage.documentsBytes / storageSummary.usage.totalBytes) * 100 
                : 0,
            },
            cloudinary: {
              bytes: storageSummary.usage.cloudinaryBytes,
              formatted: formatBytes(storageSummary.usage.cloudinaryBytes),
              percentage: storageSummary.usage.totalBytes > 0 
                ? (storageSummary.usage.cloudinaryBytes / storageSummary.usage.totalBytes) * 100 
                : 0,
            },
            attachments: {
              bytes: storageSummary.usage.attachmentsBytes,
              formatted: formatBytes(storageSummary.usage.attachmentsBytes),
              percentage: storageSummary.usage.totalBytes > 0 
                ? (storageSummary.usage.attachmentsBytes / storageSummary.usage.totalBytes) * 100 
                : 0,
            },
            base64: {
              bytes: storageSummary.usage.base64Bytes,
              formatted: formatBytes(storageSummary.usage.base64Bytes),
              percentage: storageSummary.usage.totalBytes > 0 
                ? (storageSummary.usage.base64Bytes / storageSummary.usage.totalBytes) * 100 
                : 0,
            },
          },
        },
      },
      limitations,
      recommendations: await getPlanRecommendations(tenantId),
    };

    return NextResponse.json({
      success: true,
      data: dashboard,
    });
  } catch (error: any) {
    console.error('Error getting subscription dashboard:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get subscription dashboard' },
      { status: 500 }
    );
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


