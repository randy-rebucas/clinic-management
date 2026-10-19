import { addMonths, addYears } from 'date-fns';
import { SUBSCRIPTION_PACKAGES, type SubscriptionPlan } from '@/lib/subscription-packages';

/**
 * Plan names and the date arithmetic a payment applies. Shared by the activation that runs
 * when PayPal confirms a payment and the subscription page that previews it, so the "paid
 * until" a clinic is shown before paying is the date it gets.
 */

export type BillingCycle = 'monthly' | 'yearly';

/** Plans that can be bought, cheapest first. */
export const PAID_PLANS = ['basic', 'professional', 'enterprise'] as const satisfies readonly SubscriptionPlan[];
export type PaidPlan = (typeof PAID_PLANS)[number];

export const PLAN_LABEL: Record<string, string> = {
  trial: 'Trial',
  basic: 'Basic',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

/** Days after a paid period ends during which the clinic is read-only rather than closed. */
export const GRACE_DAYS = 7;

/** What checkSubscriptionLimit refuses once a plan has ended or been cancelled, in words. */
export const BLOCKED_WHEN_UNPAID = 'patients, appointments, visits, doctors or staff accounts';

export const planLabel = (plan: string | null | undefined) => (plan ? PLAN_LABEL[plan] ?? plan : 'No plan');

export function isPaidPlan(plan: unknown): plan is PaidPlan {
  return typeof plan === 'string' && (PAID_PLANS as readonly string[]).includes(plan);
}

/**
 * Peso prices, charged through PayMongo for clinics in the Philippines. A year costs ten months.
 * Set by the business; change them here.
 */
export const PHP_MONTHLY: Record<PaidPlan, number> = { basic: 1499, professional: 3999, enterprise: 9999 };

/** The price of a plan, in pesos when `currency` is PHP (PayMongo), otherwise the package's own (PayPal). */
export function planPrice(plan: PaidPlan, cycle: BillingCycle, currency?: 'PHP'): { amount: number; currency: string } {
  if (currency === 'PHP') {
    const monthly = PHP_MONTHLY[plan];
    return { amount: cycle === 'yearly' ? monthly * 10 : monthly, currency: 'PHP' };
  }
  const { price } = SUBSCRIPTION_PACKAGES[plan];
  return {
    amount: cycle === 'yearly' ? price.yearly ?? price.monthly * 12 : price.monthly,
    currency: price.currency || 'USD',
  };
}

/** Whole months a year's payment saves against twelve monthly ones (0 when it saves nothing). */
export function monthsSavedYearly(plan: PaidPlan, currency?: 'PHP'): number {
  if (currency === 'PHP') return 2;
  const { monthly, yearly } = SUBSCRIPTION_PACKAGES[plan].price;
  if (!yearly || monthly <= 0) return 0;
  return Math.max(0, Math.round((monthly * 12 - yearly) / monthly));
}

/**
 * Where a payment made now ends: one month or year after the later of now and the current
 * paid-for end, so days already paid for aren't lost. A cancelled or ended plan starts from now.
 */
export function periodEndAfterPayment(
  current: { status?: string | null; expiresAt?: Date | string | null } | null | undefined,
  cycle: BillingCycle,
  now = new Date()
): Date {
  const currentEnd = current?.expiresAt ? new Date(current.expiresAt) : null;
  const base = current?.status === 'active' && currentEnd && currentEnd > now ? currentEnd : now;
  return cycle === 'yearly' ? addYears(base, 1) : addMonths(base, 1);
}
