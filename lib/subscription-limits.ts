/**
 * Subscription Limit Enforcement
 * Middleware and utilities to enforce subscription limitations
 */

import connectDB from '@/lib/mongodb';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations, checkLimit, hasFeature } from '@/lib/subscription-packages';
import { checkGracePeriod, isActionAllowed } from '@/lib/subscription-grace-period';
import Patient from '@/models/Patient';
import User from '@/models/User';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { Types } from 'mongoose';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, monthRangeInTz } from '@/lib/tz';

function tid(tenantId: string | Types.ObjectId): Types.ObjectId {
  return new Types.ObjectId(String(tenantId));
}

/** Clinic-local month start and day window, so limits reset at the clinic's midnight. */
async function clinicWindows(tenantId: string | Types.ObjectId, now = new Date()) {
  const tz = await getTenantTimezone(tenantId);
  const month = monthRangeInTz(now, tz);
  const day = dayRangeInTz(now, tz);
  return { startOfMonth: month.start, startOfDay: day.start, endOfDay: day.end };
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number | null;
  current: number;
  remaining: number | null;
  exceeded: boolean;
  message?: string;
}

/**
 * Check if tenant can perform an action based on subscription limits
 */
export async function checkSubscriptionLimit(
  tenantId: string | Types.ObjectId,
  action: 'createPatient' | 'createUser' | 'createDoctor' | 'createAppointment' | 'createVisit' | 'useFeature',
  featureName?: string
): Promise<{
  allowed: boolean;
  reason?: string;
  limit?: number | null;
  current?: number;
  remaining?: number | null;
}> {
  try {
    await connectDB();

    // Get subscription status
    const subscriptionStatus = await checkSubscriptionStatus(tenantId);
    
    // Check grace period
    const gracePeriod = await checkGracePeriod(tenantId);
    
    // If in grace period, check if action is allowed
    if (gracePeriod.isInGracePeriod) {
      const actionMap: Record<string, string> = {
        'createPatient': 'create:patients',
        'createUser': 'create:users',
        'createDoctor': 'create:doctors',
        'createAppointment': 'create:appointments',
        'createVisit': 'create:visits',
        'useFeature': 'read:features',
      };
      
      const mappedAction = actionMap[action] || action;
      const allowed = await isActionAllowed(tenantId, mappedAction);
      
      if (!allowed) {
        return {
          allowed: false,
          reason: `Your subscription has expired. You are in read-only mode. Please subscribe to restore full access. Grace period ends in ${gracePeriod.daysRemaining} day${gracePeriod.daysRemaining !== 1 ? 's' : ''}.`,
        };
      }
    }
    
    // If subscription is expired and not in grace period, deny all actions except subscription page access
    if (subscriptionStatus.isExpired && !gracePeriod.isInGracePeriod) {
      return {
        allowed: false,
        reason: 'Subscription has expired. Please subscribe to continue.',
      };
    }

    // If subscription is not active, deny actions
    if (!subscriptionStatus.isActive && !gracePeriod.isInGracePeriod) {
      return {
        allowed: false,
        reason: 'Subscription is not active. Please subscribe to continue.',
      };
    }

    const plan = subscriptionStatus.plan || 'trial';
    const limitations = getSubscriptionLimitations(plan);

    // Check feature availability
    if (action === 'useFeature' && featureName) {
      const featureAvailable = hasFeature(plan, featureName as any);
      if (!featureAvailable) {
        return {
          allowed: false,
          reason: `This feature is not available in your ${plan} plan. Please upgrade to access this feature.`,
        };
      }
      return { allowed: true };
    }

    // Check limits based on action
    let limitType: 'patients' | 'users' | 'doctors' | 'appointmentsPerMonth' | 'appointmentsPerDay' | 'visitsPerMonth' | 'storageGB' | null = null;
    let currentCount = 0;
    const now = new Date();

    switch (action) {
      case 'createPatient':
        limitType = 'patients';
        currentCount = await Patient.countDocuments({ tenantIds: tid(tenantId) });
        break;
      
      case 'createUser':
        limitType = 'users';
        currentCount = await User.countDocuments({ tenantId: tid(tenantId), status: { $ne: 'inactive' } });
        break;
      
      case 'createDoctor':
        limitType = 'doctors';
        currentCount = await Doctor.countDocuments({ tenantId: tid(tenantId), status: 'active' });
        break;
      
      case 'createAppointment': {
        // Check both monthly and daily limits
        const { startOfMonth, startOfDay, endOfDay } = await clinicWindows(tenantId, now);

        const monthlyCount = await Appointment.countDocuments({
          tenantId: tid(tenantId),
          createdAt: { $gte: startOfMonth },
        });

        const dailyCount = await Appointment.countDocuments({
          tenantId: tid(tenantId),
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        });

        // Check monthly limit
        const monthlyLimit = await checkLimit(plan, 'appointmentsPerMonth', monthlyCount);
        if (monthlyLimit.exceeded) {
          return {
            allowed: false,
            reason: `Monthly appointment limit (${monthlyLimit.limit}) exceeded. Please upgrade your plan.`,
            limit: monthlyLimit.limit,
            current: monthlyLimit.current,
            remaining: monthlyLimit.remaining,
          };
        }

        // Check daily limit
        const dailyLimit = await checkLimit(plan, 'appointmentsPerDay', dailyCount);
        if (dailyLimit.exceeded) {
          return {
            allowed: false,
            reason: `Daily appointment limit (${dailyLimit.limit}) exceeded. Please upgrade your plan.`,
            limit: dailyLimit.limit,
            current: dailyLimit.current,
            remaining: dailyLimit.remaining,
          };
        }

        return { allowed: true };
      }

      case 'createVisit': {
        limitType = 'visitsPerMonth';
        const { startOfMonth: visitStartOfMonth } = await clinicWindows(tenantId, now);
        currentCount = await Visit.countDocuments({
          tenantId: tid(tenantId),
          createdAt: { $gte: visitStartOfMonth },
        });
        break;
      }
      
      default:
        return { allowed: true };
    }

    if (limitType) {
      const limitResult = await checkLimit(plan, limitType, currentCount);
      
      if (limitResult.exceeded) {
        return {
          allowed: false,
          reason: `${limitType} limit (${limitResult.limit}) exceeded. Please upgrade your plan.`,
          limit: limitResult.limit,
          current: limitResult.current,
          remaining: limitResult.remaining,
        };
      }

      return {
        allowed: true,
        limit: limitResult.limit,
        current: limitResult.current,
        remaining: limitResult.remaining,
      };
    }

    return { allowed: true };
  } catch (error: any) {
    console.error('Error checking subscription limit:', error);
    // Fail closed in production — an outage must not silently grant unlimited access
    if (process.env.NODE_ENV === 'production') {
      return { allowed: false, reason: 'Unable to verify subscription limits. Please try again.' };
    }
    return { allowed: true };
  }
}

/**
 * Get current usage statistics for a tenant
 */
export async function getSubscriptionUsage(tenantId: string | Types.ObjectId): Promise<{
  patients: { current: number; limit: number | null; remaining: number | null };
  users: { current: number; limit: number | null; remaining: number | null };
  doctors: { current: number; limit: number | null; remaining: number | null };
  appointmentsThisMonth: { current: number; limit: number | null; remaining: number | null };
  appointmentsToday: { current: number; limit: number | null; remaining: number | null };
  visitsThisMonth: { current: number; limit: number | null; remaining: number | null };
  storage: { currentGB: number; limitGB: number | null; remainingGB: number | null; percentageUsed: number; exceeded: boolean };
}> {
  try {
    await connectDB();

    const subscriptionStatus = await checkSubscriptionStatus(tenantId);
    const plan = subscriptionStatus.plan || 'trial';
    const limitations = getSubscriptionLimitations(plan);

    const { startOfMonth, startOfDay, endOfDay } = await clinicWindows(tenantId);
    const tenantObjectId = tid(tenantId);

    const [
      patientsCount,
      usersCount,
      doctorsCount,
      appointmentsThisMonth,
      appointmentsToday,
      visitsThisMonth,
    ] = await Promise.all([
      Patient.countDocuments({ tenantIds: tenantObjectId }),
      User.countDocuments({ tenantId: tenantObjectId, status: { $ne: 'inactive' } }),
      Doctor.countDocuments({ tenantId: tenantObjectId, status: 'active' }),
      Appointment.countDocuments({
        tenantId: tenantObjectId,
        createdAt: { $gte: startOfMonth },
      }),
      Appointment.countDocuments({
        tenantId: tenantObjectId,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
      }),
      Visit.countDocuments({
        tenantId: tenantObjectId,
        createdAt: { $gte: startOfMonth },
      }),
    ]);

    // Get storage usage
    const { calculateStorageUsage } = await import('@/lib/storage-tracking');
    const storageUsage = await calculateStorageUsage(tenantId);

    return {
      patients: {
        current: patientsCount,
        limit: limitations.maxPatients,
        remaining: limitations.maxPatients !== null 
          ? Math.max(0, limitations.maxPatients - patientsCount)
          : null,
      },
      users: {
        current: usersCount,
        limit: limitations.maxUsers,
        remaining: limitations.maxUsers !== null 
          ? Math.max(0, limitations.maxUsers - usersCount)
          : null,
      },
      doctors: {
        current: doctorsCount,
        limit: limitations.maxDoctors,
        remaining: limitations.maxDoctors !== null 
          ? Math.max(0, limitations.maxDoctors - doctorsCount)
          : null,
      },
      appointmentsThisMonth: {
        current: appointmentsThisMonth,
        limit: limitations.maxAppointmentsPerMonth,
        remaining: limitations.maxAppointmentsPerMonth !== null 
          ? Math.max(0, limitations.maxAppointmentsPerMonth - appointmentsThisMonth)
          : null,
      },
      appointmentsToday: {
        current: appointmentsToday,
        limit: limitations.maxAppointmentsPerDay,
        remaining: limitations.maxAppointmentsPerDay !== null 
          ? Math.max(0, limitations.maxAppointmentsPerDay - appointmentsToday)
          : null,
      },
      visitsThisMonth: {
        current: visitsThisMonth,
        limit: limitations.maxVisitsPerMonth,
        remaining: limitations.maxVisitsPerMonth !== null 
          ? Math.max(0, limitations.maxVisitsPerMonth - visitsThisMonth)
          : null,
      },
      storage: {
        currentGB: storageUsage.totalGB,
        limitGB: storageUsage.limitGB,
        remainingGB: storageUsage.remainingGB,
        percentageUsed: storageUsage.percentageUsed,
        exceeded: storageUsage.exceeded,
      },
    };
  } catch (error: any) {
    console.error('Error getting subscription usage:', error);
    throw error;
  }
}

