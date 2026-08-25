/**
 * Subscription utilities for checking tenant subscription status
 *
 * Migrated off Mongoose: now calls lib/data/tenant.ts (Prisma) instead of
 * models/Tenant.ts. Tenant is not tenant-scoped (it's the root), so these
 * calls run under runAsSystem() for consistency with other Tenant-touching
 * code, though the extension itself doesn't require it for this model.
 */

import { getTenantById } from '@/lib/data/tenant';
import { runAsSystem } from '@/lib/tenant-context';

export interface SubscriptionStatus {
  isActive: boolean;
  isExpired: boolean;
  isTrial: boolean;
  expiresAt: Date | null;
  plan: string | null;
  daysRemaining: number | null;
  status?: 'active' | 'cancelled' | 'expired';
}

/**
 * Check if tenant subscription is active and not expired
 */
export async function checkSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus> {
  try {
    const tenant = await runAsSystem(() => getTenantById(tenantId));

    if (!tenant || !tenant.subscriptionPlan) {
      return {
        isActive: false,
        isExpired: true,
        isTrial: false,
        expiresAt: null,
        plan: null,
        daysRemaining: null,
      };
    }

    const now = new Date();
    const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const isActive = tenant.subscriptionStatus === 'active' && !isExpired;
    const isTrial = tenant.subscriptionPlan === 'trial';

    let daysRemaining: number | null = null;
    if (expiresAt && !isExpired) {
      const diffTime = expiresAt.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      isActive,
      isExpired,
      isTrial,
      expiresAt,
      plan: tenant.subscriptionPlan || null,
      daysRemaining,
      status: (tenant.subscriptionStatus as 'active' | 'cancelled' | 'expired') || 'expired',
    };
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return {
      isActive: false,
      isExpired: true,
      isTrial: false,
      expiresAt: null,
      plan: null,
      daysRemaining: null,
    };
  }
}

/**
 * Check if subscription requires redirect to subscription page
 */
export async function requiresSubscriptionRedirect(tenantId: string): Promise<boolean> {
  const status = await checkSubscriptionStatus(tenantId);

  // Check grace period
  const { checkGracePeriod } = await import('@/lib/subscription-grace-period');
  const gracePeriod = await checkGracePeriod(tenantId);

  // Don't redirect if in grace period (read-only access allowed)
  if (gracePeriod.isInGracePeriod) {
    return false;
  }

  return status.isExpired || (!status.isActive && status.plan === 'trial');
}
