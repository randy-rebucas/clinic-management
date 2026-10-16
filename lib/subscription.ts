/**
 * Subscription utilities for checking tenant subscription status
 */

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import PaypalOrder from '@/models/PaypalOrder';
import { Types } from 'mongoose';
import { addMonths, addYears } from 'date-fns';

/** Plans that never expire. A missing expiresAt on any other plan means expired. */
const NON_EXPIRING_PLANS = new Set(['lifetime', 'free']);

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
    const isExpired = expiresAt ? expiresAt < now : !NON_EXPIRING_PLANS.has(subscription.plan);
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

export interface CapturedPayment {
  transactionId?: string;
  amount?: number;
  currency?: string;
  payerEmail?: string;
}

export type ActivationResult =
  | { ok: true; alreadyApplied: boolean; subscription: any }
  | { ok: false; status: number; error: string };

/**
 * Apply a captured PayPal payment to the tenant's subscription.
 *
 * Idempotent: keyed by the PayPal order id, so the capture-order route, its retries
 * and the PAYMENT.CAPTURE.COMPLETED webhook can all call it safely. Plan, cycle and
 * expected amount come from the PaypalOrder record created server-side, never from
 * the client.
 */
export async function activateSubscriptionFromOrder(
  orderId: string,
  payment: CapturedPayment
): Promise<ActivationResult> {
  await connectDB();

  const order = await PaypalOrder.findOne({ orderId }).lean<any>();
  if (!order) return { ok: false, status: 404, error: 'Order not found' };

  if (typeof payment.amount === 'number' && payment.amount + 0.005 < Number(order.amount)) {
    console.error(`PayPal order ${orderId}: captured ${payment.amount} < expected ${order.amount}`);
    return { ok: false, status: 400, error: 'Captured amount does not match order' };
  }
  if (payment.currency && order.currency && payment.currency !== order.currency) {
    console.error(`PayPal order ${orderId}: currency ${payment.currency} != ${order.currency}`);
    return { ok: false, status: 400, error: 'Captured currency does not match order' };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const tenant = await Tenant.findById(order.tenantId).select('subscription').lean<any>();
    if (!tenant) return { ok: false, status: 404, error: 'Tenant not found' };

    const sub = tenant.subscription || {};
    if ((sub.paymentHistory || []).some((p: any) => p.orderId === orderId && p.status !== 'failed')) {
      await PaypalOrder.updateOne({ orderId }, { $set: { status: 'completed' } });
      return { ok: true, alreadyApplied: true, subscription: sub };
    }

    // Extend from the later of now and the current expiry so paid-for days aren't lost.
    const now = new Date();
    const currentExpiry = sub.expiresAt ? new Date(sub.expiresAt) : null;
    const base = sub.status === 'active' && currentExpiry && currentExpiry > now ? currentExpiry : now;
    const expiresAt = order.billingCycle === 'yearly' ? addYears(base, 1) : addMonths(base, 1);

    const entry = {
      transactionId: payment.transactionId || orderId,
      orderId,
      amount: payment.amount ?? order.amount,
      currency: payment.currency || order.currency,
      payerEmail: payment.payerEmail,
      plan: order.plan,
      billingCycle: order.billingCycle,
      status: 'completed' as const,
      paidAt: now,
    };

    // Optimistic concurrency on expiresAt: a concurrent activation makes this miss and retry.
    const updated = await Tenant.findOneAndUpdate(
      {
        _id: order.tenantId,
        'subscription.expiresAt': sub.expiresAt ?? null,
        'subscription.paymentHistory': { $not: { $elemMatch: { orderId, status: { $ne: 'failed' } } } },
      },
      {
        $set: {
          'subscription.plan': order.plan,
          'subscription.status': 'active',
          'subscription.billingCycle': order.billingCycle,
          'subscription.expiresAt': expiresAt,
          'subscription.renewalAt': expiresAt,
          'subscription.paypalOrderId': orderId,
        },
        $push: { 'subscription.paymentHistory': entry },
      },
      { new: true, runValidators: true }
    )
      .select('subscription')
      .lean<any>();

    if (updated) {
      await PaypalOrder.updateOne({ orderId }, { $set: { status: 'completed' } });
      return { ok: true, alreadyApplied: false, subscription: updated.subscription };
    }
  }

  return { ok: false, status: 409, error: 'Could not apply payment, please retry' };
}
