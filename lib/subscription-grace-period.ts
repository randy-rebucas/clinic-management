/**
 * Grace Period Management
 * Allows limited access after subscription expiration
 */

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { Types } from 'mongoose';

export interface GracePeriodStatus {
  isInGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  daysRemaining: number | null;
  accessLevel: 'full' | 'read-only' | 'none';
  allowedActions: string[];
  blockedActions: string[];
}

/**
 * Check if tenant is in grace period
 * Grace period: 7 days after expiration with read-only access
 */
export async function checkGracePeriod(
  tenantId: string | Types.ObjectId
): Promise<GracePeriodStatus> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const subscriptionStatus = await checkSubscriptionStatus(tenantIdObj);

    // If subscription is active, no grace period needed
    if (subscriptionStatus.isActive && !subscriptionStatus.isExpired) {
      return {
        isInGracePeriod: false,
        gracePeriodEndsAt: null,
        daysRemaining: null,
        accessLevel: 'full',
        allowedActions: ['*'], // All actions allowed
        blockedActions: [],
      };
    }

    // If subscription is expired, check for grace period
    if (subscriptionStatus.isExpired && subscriptionStatus.expiresAt) {
      const expiresAt = new Date(subscriptionStatus.expiresAt);
      const gracePeriodEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const now = new Date();

      if (now <= gracePeriodEndsAt) {
        // In grace period
        const daysRemaining = Math.ceil((gracePeriodEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          isInGracePeriod: true,
          gracePeriodEndsAt,
          daysRemaining,
          accessLevel: 'read-only',
          allowedActions: [
            'read:patients',
            'read:appointments',
            'read:visits',
            'read:prescriptions',
            'read:lab-results',
            'read:invoices',
            'read:documents',
            'read:reports',
            'export:data',
            'view:subscription',
          ],
          blockedActions: [
            'create:patients',
            'create:appointments',
            'create:visits',
            'create:prescriptions',
            'create:lab-results',
            'create:invoices',
            'create:documents',
            'update:patients',
            'update:appointments',
            'update:visits',
            'delete:patients',
            'delete:appointments',
            'delete:visits',
            'upload:files',
          ],
        };
      } else {
        // Grace period expired
        return {
          isInGracePeriod: false,
          gracePeriodEndsAt,
          daysRemaining: 0,
          accessLevel: 'none',
          allowedActions: [
            'view:subscription',
          ],
          blockedActions: ['*'], // All actions blocked except subscription page
        };
      }
    }

    // No subscription or trial
    return {
      isInGracePeriod: false,
      gracePeriodEndsAt: null,
      daysRemaining: null,
      accessLevel: 'none',
      allowedActions: ['view:subscription'],
      blockedActions: ['*'],
    };
  } catch (error: any) {
    console.error('Error checking grace period:', error);
    // On error, deny access (fail closed)
    return {
      isInGracePeriod: false,
      gracePeriodEndsAt: null,
      daysRemaining: null,
      accessLevel: 'none',
      allowedActions: ['view:subscription'],
      blockedActions: ['*'],
    };
  }
}

/**
 * Check if an action is allowed in grace period
 */
export async function isActionAllowed(
  tenantId: string | Types.ObjectId,
  action: string
): Promise<boolean> {
  const gracePeriod = await checkGracePeriod(tenantId);

  if (gracePeriod.accessLevel === 'full') {
    return true;
  }

  if (gracePeriod.accessLevel === 'none') {
    return gracePeriod.allowedActions.includes('view:subscription') && action === 'view:subscription';
  }

  // Read-only mode
  return gracePeriod.allowedActions.includes(action) || gracePeriod.allowedActions.includes('*');
}

/**
 * Get grace period message for UI
 */
export async function getGracePeriodMessage(
  tenantId: string | Types.ObjectId
): Promise<{
  message: string;
  type: 'info' | 'warning' | 'error';
  daysRemaining: number | null;
} | null> {
  const gracePeriod = await checkGracePeriod(tenantId);

  if (!gracePeriod.isInGracePeriod) {
    return null;
  }

  if (gracePeriod.daysRemaining === null) {
    return {
      message: 'Your subscription has expired. You are in read-only mode. Please subscribe to restore full access.',
      type: 'warning',
      daysRemaining: null,
    };
  }

  if (gracePeriod.daysRemaining <= 1) {
    return {
      message: `Your grace period ends today. Subscribe now to avoid losing access.`,
      type: 'error',
      daysRemaining: gracePeriod.daysRemaining,
    };
  }

  return {
    message: `Your subscription has expired. You are in read-only mode for ${gracePeriod.daysRemaining} more day${gracePeriod.daysRemaining !== 1 ? 's' : ''}. Please subscribe to restore full access.`,
    type: 'warning',
    daysRemaining: gracePeriod.daysRemaining,
  };
}

