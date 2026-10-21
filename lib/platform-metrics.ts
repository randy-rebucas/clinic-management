import { type SubscriptionPlan } from '@/lib/subscription-packages';
import { planPrice, type PaidPlan } from '@/lib/subscription-period';

/**
 * Platform-wide business numbers for the super-admin console, computed from tenants'
 * embedded subscriptions. Pure functions over plain rows, so they test without a database.
 *
 * Definitions (shown in the console next to each number):
 *  - Paying: a paid plan, subscription status active, current period not ended.
 *  - MRR: each paying clinic's list price, yearly plans divided by 12, in the currency plans
 *    are sold in now (pesos under PayMongo, the packages' USD under PayPal).
 *    Clinics that cancelled are left out even while their period runs on.
 *  - Churned (30 days): a paid plan whose period ended in the last 30 days without renewal.
 *    Churn rate = churned / (paying + churned).
 *  - Trial → paid: of the clinics that signed up 30–120 days ago (their trial is over),
 *    the share with at least one completed payment.
 */

export const PAID_PLANS: SubscriptionPlan[] = ['basic', 'professional', 'enterprise'];

const DAY = 24 * 60 * 60 * 1000;

export interface PlatformTenantRow {
  _id: string;
  name: string;
  subdomain: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  subscription?: {
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    billingCycle?: 'monthly' | 'yearly';
    expiresAt?: Date | null;
    paymentHistory?: Array<{
      amount: number;
      currency?: string;
      status?: 'completed' | 'refunded' | 'failed';
      paidAt: Date;
    }>;
  } | null;
}

export type TenantLifecycle = 'paying' | 'cancelling' | 'trial' | 'trial-ended' | 'lapsed' | 'suspended';

export const LIFECYCLE_LABEL: Record<TenantLifecycle, string> = {
  paying: 'Paying',
  cancelling: 'Cancelling',
  trial: 'In trial',
  'trial-ended': 'Trial ended',
  lapsed: 'Lapsed',
  suspended: 'Suspended',
};

export function isPaidPlan(plan: unknown): plan is SubscriptionPlan {
  return typeof plan === 'string' && (PAID_PLANS as string[]).includes(plan);
}

/** Where a clinic stands commercially right now. */
export function lifecycleOf(t: PlatformTenantRow, now: Date): TenantLifecycle {
  if (t.status !== 'active') return 'suspended';
  const sub = t.subscription ?? {};
  const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : null;
  const running = !!expiresAt && expiresAt > now;
  if (isPaidPlan(sub.plan)) {
    if (!running || sub.status === 'expired') return 'lapsed';
    return sub.status === 'cancelled' ? 'cancelling' : 'paying';
  }
  return running ? 'trial' : 'trial-ended';
}

/** One clinic's monthly recurring revenue at list price in `currency` (planPrice's), 0 unless paying. */
export function monthlyValue(t: PlatformTenantRow, now: Date, currency?: 'PHP'): number {
  if (lifecycleOf(t, now) !== 'paying') return 0;
  const sub = t.subscription!;
  const yearly = sub.billingCycle === 'yearly';
  return planPrice(sub.plan as PaidPlan, yearly ? 'yearly' : 'monthly', currency).amount / (yearly ? 12 : 1);
}

/** The currency monthlyValue reports in for a given planPrice currency. */
export const mrrCurrency = (currency?: 'PHP') => planPrice('basic', 'monthly', currency).currency;

function hasPaid(t: PlatformTenantRow): boolean {
  return (t.subscription?.paymentHistory ?? []).some((p) => (p.status ?? 'completed') === 'completed');
}

export interface MonthRevenue {
  /** YYYY-MM */
  month: string;
  byCurrency: Record<string, number>;
}

export interface PlatformMetrics {
  asOf: string;
  tenants: { total: number; byLifecycle: Record<TenantLifecycle, number> };
  /** ISO code mrr, arr and mrrByPlan are in. */
  currency: string;
  mrr: number;
  arr: number;
  mrrByPlan: Array<{ plan: SubscriptionPlan; clinics: number; mrr: number }>;
  churn: { churned: number; base: number; rate: number | null };
  trialConversion: { cohort: number; converted: number; rate: number | null };
  signups: { last30: number; previous30: number };
  revenue: MonthRevenue[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function computePlatformMetrics(rows: PlatformTenantRow[], now = new Date(), months = 6, currency?: 'PHP'): PlatformMetrics {
  const byLifecycle: Record<TenantLifecycle, number> = {
    paying: 0, cancelling: 0, trial: 0, 'trial-ended': 0, lapsed: 0, suspended: 0,
  };
  const planAgg = new Map<SubscriptionPlan, { clinics: number; mrr: number }>(
    PAID_PLANS.map((p) => [p, { clinics: 0, mrr: 0 }])
  );
  let mrr = 0;
  let churned = 0;
  let cohort = 0;
  let converted = 0;
  let last30 = 0;
  let previous30 = 0;

  const t30 = now.getTime() - 30 * DAY;
  const t60 = now.getTime() - 60 * DAY;
  const t120 = now.getTime() - 120 * DAY;

  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthKeys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  const revenue = new Map<string, Record<string, number>>(monthKeys.map((k) => [k, {}]));

  for (const t of rows) {
    const life = lifecycleOf(t, now);
    byLifecycle[life]++;

    const value = monthlyValue(t, now, currency);
    if (value > 0) {
      mrr += value;
      const agg = planAgg.get(t.subscription!.plan as SubscriptionPlan)!;
      agg.clinics++;
      agg.mrr += value;
    }

    const sub = t.subscription;
    const expiresAt = sub?.expiresAt ? new Date(sub.expiresAt).getTime() : null;
    if (isPaidPlan(sub?.plan) && expiresAt !== null && expiresAt >= t30 && expiresAt < now.getTime()) churned++;

    const created = new Date(t.createdAt).getTime();
    if (created >= t30) last30++;
    else if (created >= t60) previous30++;
    if (created >= t120 && created < t30) {
      cohort++;
      if (hasPaid(t)) converted++;
    }

    for (const p of sub?.paymentHistory ?? []) {
      if ((p.status ?? 'completed') !== 'completed') continue;
      const bucket = revenue.get(monthKey(new Date(p.paidAt)));
      if (!bucket) continue;
      const cur = (p.currency || 'USD').toUpperCase();
      bucket[cur] = round2((bucket[cur] ?? 0) + (Number(p.amount) || 0));
    }
  }

  const base = byLifecycle.paying + churned;
  return {
    asOf: now.toISOString(),
    tenants: { total: rows.length, byLifecycle },
    currency: mrrCurrency(currency),
    mrr: round2(mrr),
    arr: round2(mrr * 12),
    mrrByPlan: PAID_PLANS.map((plan) => ({ plan, ...planAgg.get(plan)!, mrr: round2(planAgg.get(plan)!.mrr) })),
    churn: { churned, base, rate: base ? churned / base : null },
    trialConversion: { cohort, converted, rate: cohort ? converted / cohort : null },
    signups: { last30, previous30 },
    revenue: monthKeys.map((month) => ({ month, byCurrency: revenue.get(month)! })),
  };
}
