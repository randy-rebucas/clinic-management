import { addMonths, addYears } from 'date-fns';
import type { SubscriptionPlan } from '@/lib/subscription-packages';

/**
 * Plan names and the date arithmetic a payment applies. Shared by the activation that runs
 * when PayMongo confirms a payment and the subscription page that previews it, so the "paid
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
 * The peso price list, charged through PayMongo. Platform admins set it under Platform →
 * Configuration (lib/platform-config.ts); DEFAULT_PRICING is the list until they first do.
 * `yearlyMonths` is how many months a year's payment costs (10: two months free).
 */
export type PlanPricing = { monthly: Record<PaidPlan, number>; yearlyMonths: number };

export const DEFAULT_PRICING: PlanPricing = {
  monthly: { basic: 1499, professional: 3999, enterprise: 9999 },
  yearlyMonths: 10,
};

/** @deprecated The default monthly prices; read the configured list with getPlanPricing(). */
export const PHP_MONTHLY: Record<PaidPlan, number> = DEFAULT_PRICING.monthly;

/** The price of a plan in pesos, from `pricing` (the configured list; the defaults otherwise). */
export function planPrice(
  plan: PaidPlan,
  cycle: BillingCycle,
  pricing: PlanPricing = DEFAULT_PRICING
): { amount: number; currency: 'PHP' } {
  const monthly = pricing.monthly[plan];
  return { amount: cycle === 'yearly' ? monthly * pricing.yearlyMonths : monthly, currency: 'PHP' };
}

/** Whole months a year's payment saves against twelve monthly ones (0 when it saves nothing). */
export function monthsSavedYearly(pricing: PlanPricing = DEFAULT_PRICING): number {
  return Math.max(0, 12 - pricing.yearlyMonths);
}

/**
 * Where a payment made now ends: one month or year after the later of now and the current
 * paid-for end, so days already paid for aren't lost. A cancelled or ended plan starts from now.
 *
 * Switching plans carries the unused time over at its value, not its length: the days left on
 * the old plan are converted at the two plans' daily prices. Otherwise a year of Basic followed
 * by one month of Enterprise would buy thirteen months of Enterprise.
 */
export function periodEndAfterPayment(
  current: {
    status?: string | null;
    expiresAt?: Date | string | null;
    plan?: string | null;
    billingCycle?: string | null;
  } | null | undefined,
  cycle: BillingCycle,
  now = new Date(),
  next?: { plan: PaidPlan; pricing?: PlanPricing }
): Date {
  const currentEnd = current?.expiresAt ? new Date(current.expiresAt) : null;
  const active = current?.status === 'active' && !!currentEnd && currentEnd > now;
  let base = active ? (currentEnd as Date) : now;
  if (active && next && current?.plan !== next.plan) {
    const oldPlan = current?.plan;
    const oldCycle: BillingCycle = current?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    // A plan that was never bought (trial) is worth nothing to carry.
    const ratio = isPaidPlan(oldPlan) ? dailyPrice(oldPlan, oldCycle, next.pricing) / dailyPrice(next.plan, cycle, next.pricing) : 0;
    base = new Date(now.getTime() + ((currentEnd as Date).getTime() - now.getTime()) * ratio);
  }
  return cycle === 'yearly' ? addYears(base, 1) : addMonths(base, 1);
}

function dailyPrice(plan: PaidPlan, cycle: BillingCycle, pricing?: PlanPricing): number {
  return planPrice(plan, cycle, pricing).amount / (cycle === 'yearly' ? 365 : 30);
}
