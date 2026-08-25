/**
 * Subscription Limit Enforcement
 * Middleware and utilities to enforce subscription limitations
 *
 * Migrated off Mongoose: counts now go through lib/data/*.ts (Prisma).
 * Both exported functions always receive an explicit tenantId and
 * self-wrap their entire body in runWithTenant(tenantId, fn) — unlike most
 * lib/data/*.ts modules, this file doesn't assume the caller already
 * established context, since several callers (app/api/doctors/route.ts,
 * app/api/subscription/{dashboard,usage}/route.ts) aren't migrated yet and
 * would otherwise hit the tenant-scoping extension's "no context" guard.
 */

import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations, checkLimit, hasFeature } from '@/lib/subscription-packages';
import { checkGracePeriod, isActionAllowed } from '@/lib/subscription-grace-period';
import { countPatients } from '@/lib/data/patient';
import { countUsers } from '@/lib/data/user';
import { countActiveDoctors } from '@/lib/data/doctor';
import { countAppointmentsCreatedInRange } from '@/lib/data/appointment';
import { countVisitsInRange } from '@/lib/data/visit';
import { runWithTenant } from '@/lib/tenant-context';

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
  tenantId: string,
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
    return await runWithTenant(tenantId, () => checkSubscriptionLimitImpl(tenantId, action, featureName));
  } catch (error: any) {
    console.error('Error checking subscription limit:', error);
    if (process.env.NODE_ENV === 'production') {
      return { allowed: false, reason: 'Unable to verify subscription limits. Please try again.' };
    }
    return { allowed: true };
  }
}

async function checkSubscriptionLimitImpl(
  tenantId: string,
  action: 'createPatient' | 'createUser' | 'createDoctor' | 'createAppointment' | 'createVisit' | 'useFeature',
  featureName?: string
): Promise<{
  allowed: boolean;
  reason?: string;
  limit?: number | null;
  current?: number;
  remaining?: number | null;
}> {
  {
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
        currentCount = await countPatients();
        break;

      case 'createUser':
        limitType = 'users';
        currentCount = await countUsers({ status: 'active' });
        break;

      case 'createDoctor':
        limitType = 'doctors';
        currentCount = await countActiveDoctors();
        break;

      case 'createAppointment': {
        // Check both monthly and daily limits
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

        const monthlyCount = await countAppointmentsCreatedInRange({ start: startOfMonth });
        const dailyCount = await countAppointmentsCreatedInRange({ start: startOfDay, end: endOfDay });

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
        const visitStartOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        currentCount = await countVisitsInRange({ start: visitStartOfMonth });
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
  }
}

/**
 * Get current usage statistics for a tenant
 */
export async function getSubscriptionUsage(tenantId: string): Promise<{
  patients: { current: number; limit: number | null; remaining: number | null };
  users: { current: number; limit: number | null; remaining: number | null };
  doctors: { current: number; limit: number | null; remaining: number | null };
  appointmentsThisMonth: { current: number; limit: number | null; remaining: number | null };
  appointmentsToday: { current: number; limit: number | null; remaining: number | null };
  visitsThisMonth: { current: number; limit: number | null; remaining: number | null };
  storage: { currentGB: number; limitGB: number | null; remainingGB: number | null; percentageUsed: number; exceeded: boolean };
}> {
  return runWithTenant(tenantId, () => getSubscriptionUsageImpl(tenantId));
}

async function getSubscriptionUsageImpl(tenantId: string) {
  try {
    const subscriptionStatus = await checkSubscriptionStatus(tenantId);
    const plan = subscriptionStatus.plan || 'trial';
    const limitations = getSubscriptionLimitations(plan);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    const [
      patientsCount,
      usersCount,
      doctorsCount,
      appointmentsThisMonth,
      appointmentsToday,
      visitsThisMonth,
    ] = await Promise.all([
      countPatients(),
      countUsers({ status: 'active' }),
      countActiveDoctors(),
      countAppointmentsCreatedInRange({ start: startOfMonth }),
      countAppointmentsCreatedInRange({ start: startOfDay, end: endOfDay }),
      countVisitsInRange({ start: startOfMonth }),
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
