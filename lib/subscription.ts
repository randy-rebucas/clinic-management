/**
 * Subscription utilities for checking tenant subscription status
 */

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { Types } from 'mongoose';

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
export async function checkSubscriptionStatus(tenantId: string | Types.ObjectId): Promise<SubscriptionStatus> {
  try {
    await connectDB();
    
    const tenant = await Tenant.findById(tenantId).select('subscription').lean() as any;
    
    if (!tenant || !tenant.subscription) {
      return {
        isActive: false,
        isExpired: true,
        isTrial: false,
        expiresAt: null,
        plan: null,
        daysRemaining: null,
      };
    }

    const subscription = tenant.subscription;
    const now = new Date();
    const expiresAt = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const isActive = subscription.status === 'active' && !isExpired;
    const isTrial = subscription.plan === 'trial';
    
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
      plan: subscription.plan || null,
      daysRemaining,
      status: subscription.status || 'expired',
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
export async function requiresSubscriptionRedirect(tenantId: string | Types.ObjectId): Promise<boolean> {
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
