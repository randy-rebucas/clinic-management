import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import PaypalOrder from '@/models/PaypalOrder';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionUsage } from '@/lib/subscription-limits';
import { isPayPalConfigured } from '@/lib/paypal';
import { SUBSCRIPTION_PACKAGES } from '@/lib/subscription-packages';
import { buildUsageRows, planLimits, type UsageKey, type UsageRow } from '@/lib/plan-usage';
import {
  PAID_PLANS,
  isPaidPlan,
  monthsSavedYearly,
  periodEndAfterPayment,
  planLabel,
  planPrice,
  type BillingCycle,
  type PaidPlan,
} from '@/lib/subscription-period';

/**
 * Everything /admin/subscription shows, read on the server: where the plan stands (including
 * the read-only days after it ends), what the clinic uses of each limit the system enforces,
 * what each plan would allow and cost with the "paid until" a payment today would give, the
 * payments made, and any payment started at PayPal but not finished.
 */

/** PaypalOrder deletes pending orders after two hours (TTL index). */
const PENDING_LIFETIME_MS = 2 * 60 * 60 * 1000;

/**
 * trial / active: paid for (or on trial) and in date. cancelled: the payment for the period was
 * refunded or declined. ended: past its end date. none: no plan. (The "grace period" in
 * lib/subscription-grace-period refuses the same actions as an ended plan, so it isn't a
 * separate state here; reads are never refused in either.)
 */
export type PlanState = 'trial' | 'active' | 'cancelled' | 'ended' | 'none';

export interface PlanNow {
  key: string | null;
  label: string;
  state: PlanState;
  cycle: BillingCycle | null;
  /** "Oct 31, 2026" in the clinic's zone. */
  endsOn: string | null;
  daysLeft: number | null;
  /** When the current period was paid for (or the trial began), for the period bar. */
  startedOn: string | null;
  /** Share of the period already used, 0–1, or null when there is no period to draw. */
  elapsed: number | null;
}

export interface CycleOffer {
  amount: number;
  currency: string;
  /** End date a payment made now would give, in the clinic's zone. */
  paidUntil: string;
}

export interface PlanOffer {
  plan: PaidPlan;
  label: string;
  limits: Record<UsageKey, number | null>;
  support: string;
  monthly: CycleOffer;
  yearly: CycleOffer & { monthsSaved: number };
}

export interface PaymentRow {
  id: string;
  paidOn: string;
  plan: string;
  cycle: BillingCycle;
  amount: number;
  currency: string;
  status: 'completed' | 'refunded' | 'failed';
  reference: string;
}

export interface UnfinishedPayment {
  orderId: string;
  startedAt: string;
  plan: string;
  cycle: BillingCycle;
  amount: number;
  currency: string;
  /** pending: not approved or not confirmed yet. processing: PayPal may have taken it; still being applied. */
  status: 'pending' | 'processing';
}

export interface SubscriptionPageData {
  clinicName: string;
  plan: PlanNow;
  usage: UsageRow[] | null;
  offers: PlanOffer[];
  payments: PaymentRow[];
  unfinished: UnfinishedPayment[];
  paypalReady: boolean;
}

const SUPPORT: Record<string, string> = { basic: 'Email', priority: 'Priority', '24/7': 'Around the clock' };

interface TenantDoc {
  name?: string;
  displayName?: string;
  createdAt?: Date;
  subscription?: {
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    billingCycle?: BillingCycle;
    expiresAt?: Date;
    paypalOrderId?: string;
    paymentHistory?: {
      _id?: Types.ObjectId;
      transactionId: string;
      orderId: string;
      amount: number;
      currency: string;
      plan: string;
      billingCycle?: BillingCycle;
      status?: 'completed' | 'refunded' | 'failed';
      paidAt?: Date;
    }[];
  };
}

export async function loadSubscriptionPage(session: { tenantId?: string | null }): Promise<SubscriptionPageData> {
  await connectDB();
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) {
    throw new Error('This account is not linked to a clinic');
  }
  const tenantId = new Types.ObjectId(session.tenantId);
  const now = new Date();

  const [tz, tenant, status, usage, orders] = await Promise.all([
    getTenantTimezone(tenantId),
    Tenant.findById(tenantId).select('name displayName createdAt subscription').lean<TenantDoc | null>(),
    checkSubscriptionStatus(tenantId),
    getSubscriptionUsage(tenantId).catch((error) => {
      console.error('Subscription page: usage unavailable', error);
      return null;
    }),
    PaypalOrder.find({
      tenantId,
      $or: [{ status: 'processing' }, { status: 'pending', createdAt: { $gte: new Date(now.getTime() - PENDING_LIFETIME_MS) } }],
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean<{ orderId: string; plan: string; billingCycle: BillingCycle; amount: number; currency: string; status: 'pending' | 'processing'; createdAt: Date }[]>(),
  ]);

  const sub = tenant?.subscription;
  const day = (d: Date | string) => formatInTz(d, 'MMM d, yyyy', tz);
  const expiresAt = status.expiresAt ? new Date(status.expiresAt) : null;

  // --- Where the plan stands --------------------------------------------------------------
  let state: PlanState;
  if (!status.plan) state = 'none';
  else if (sub?.status === 'cancelled') state = 'cancelled';
  else if (status.isExpired) state = 'ended';
  else state = status.isTrial ? 'trial' : 'active';

  const history = [...(sub?.paymentHistory ?? [])].sort(
    (a, b) => new Date(b.paidAt ?? 0).getTime() - new Date(a.paidAt ?? 0).getTime()
  );
  const funding = history.find((p) => p.orderId === sub?.paypalOrderId && p.status === 'completed');
  const started = state === 'trial' ? tenant?.createdAt ?? null : funding?.paidAt ?? null;
  const span = started && expiresAt ? expiresAt.getTime() - new Date(started).getTime() : 0;

  const plan: PlanNow = {
    key: status.plan,
    label: planLabel(status.plan),
    state,
    cycle: state === 'trial' || !sub?.billingCycle ? null : sub.billingCycle,
    endsOn: expiresAt ? day(expiresAt) : null,
    daysLeft: status.daysRemaining,
    startedOn: started ? day(started) : null,
    elapsed:
      span > 0 && (state === 'trial' || state === 'active')
        ? Math.min(1, Math.max(0, (now.getTime() - new Date(started as Date).getTime()) / span))
        : null,
  };

  // --- What each plan allows, costs, and would run to --------------------------------------
  // Activation extends from the current end only while the plan is active; mirror it exactly.
  const current = { status: sub?.status, expiresAt: sub?.expiresAt };
  const offers: PlanOffer[] = PAID_PLANS.map((p) => {
    const monthly = planPrice(p, 'monthly');
    const yearly = planPrice(p, 'yearly');
    return {
      plan: p,
      label: planLabel(p),
      limits: planLimits(p),
      support: SUPPORT[SUBSCRIPTION_PACKAGES[p].features.supportLevel] ?? SUBSCRIPTION_PACKAGES[p].features.supportLevel,
      monthly: { ...monthly, paidUntil: day(periodEndAfterPayment(current, 'monthly', now)) },
      yearly: { ...yearly, paidUntil: day(periodEndAfterPayment(current, 'yearly', now)), monthsSaved: monthsSavedYearly(p) },
    };
  });

  return {
    clinicName: tenant?.displayName || tenant?.name || 'Your clinic',
    plan,
    usage: usage ? buildUsageRows(usage) : null,
    offers,
    payments: history.map((p, i) => ({
      id: p._id?.toString() ?? `${p.orderId}-${i}`,
      paidOn: p.paidAt ? day(p.paidAt) : '—',
      plan: planLabel(p.plan),
      cycle: p.billingCycle === 'yearly' ? 'yearly' : 'monthly',
      amount: p.amount,
      currency: p.currency || 'USD',
      status: p.status ?? 'completed',
      reference: p.transactionId || p.orderId,
    })),
    unfinished: orders
      .filter((o) => isPaidPlan(o.plan))
      .map((o) => ({
        orderId: o.orderId,
        startedAt: formatInTz(o.createdAt, 'MMM d, h:mm a', tz),
        plan: planLabel(o.plan),
        cycle: o.billingCycle,
        amount: o.amount,
        currency: o.currency || 'USD',
        status: o.status,
      })),
    paypalReady: isPayPalConfigured(),
  };
}
