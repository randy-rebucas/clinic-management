import { describe, it, expect } from 'vitest';
import { computePlatformMetrics, lifecycleOf, monthlyValue, type PlatformTenantRow } from '@/lib/platform-metrics';

const NOW = new Date('2026-10-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY);

let seq = 0;
function tenant(overrides: Partial<PlatformTenantRow> & { sub?: PlatformTenantRow['subscription'] } = {}): PlatformTenantRow {
  const { sub, ...rest } = overrides;
  return {
    _id: String(++seq),
    name: `Clinic ${seq}`,
    subdomain: `c${seq}`,
    status: 'active',
    createdAt: daysFromNow(-200),
    subscription: sub === undefined ? { plan: 'trial', status: 'active', expiresAt: daysFromNow(10) } : sub,
    ...rest,
  };
}

describe('lifecycleOf', () => {
  it('classifies paid, cancelling, lapsed, trial and suspended clinics', () => {
    expect(lifecycleOf(tenant({ sub: { plan: 'basic', status: 'active', expiresAt: daysFromNow(5) } }), NOW)).toBe('paying');
    expect(lifecycleOf(tenant({ sub: { plan: 'basic', status: 'cancelled', expiresAt: daysFromNow(5) } }), NOW)).toBe('cancelling');
    expect(lifecycleOf(tenant({ sub: { plan: 'basic', status: 'active', expiresAt: daysFromNow(-1) } }), NOW)).toBe('lapsed');
    expect(lifecycleOf(tenant({ sub: { plan: 'trial', status: 'active', expiresAt: daysFromNow(3) } }), NOW)).toBe('trial');
    expect(lifecycleOf(tenant({ sub: { plan: 'trial', status: 'active', expiresAt: daysFromNow(-3) } }), NOW)).toBe('trial-ended');
    expect(lifecycleOf(tenant({ sub: null }), NOW)).toBe('trial-ended');
    expect(lifecycleOf(tenant({ status: 'suspended', sub: { plan: 'enterprise', status: 'active', expiresAt: daysFromNow(30) } }), NOW)).toBe('suspended');
  });
});

describe('monthlyValue', () => {
  it('uses the monthly list price, and a twelfth of the yearly price', () => {
    expect(monthlyValue(tenant({ sub: { plan: 'professional', status: 'active', billingCycle: 'monthly', expiresAt: daysFromNow(5) } }), NOW)).toBe(79);
    expect(monthlyValue(tenant({ sub: { plan: 'basic', status: 'active', billingCycle: 'yearly', expiresAt: daysFromNow(200) } }), NOW)).toBeCloseTo(290 / 12);
  });

  it('is zero for cancelled, lapsed and trial clinics', () => {
    expect(monthlyValue(tenant({ sub: { plan: 'basic', status: 'cancelled', expiresAt: daysFromNow(5) } }), NOW)).toBe(0);
    expect(monthlyValue(tenant({ sub: { plan: 'basic', status: 'active', expiresAt: daysFromNow(-5) } }), NOW)).toBe(0);
    expect(monthlyValue(tenant(), NOW)).toBe(0);
  });
});

describe('computePlatformMetrics', () => {
  it('adds up MRR, churn, trial conversion, sign-ups and monthly revenue', () => {
    const rows = [
      // paying: 79 + 29 + 199/… yearly enterprise 1990/12
      tenant({ sub: { plan: 'professional', status: 'active', billingCycle: 'monthly', expiresAt: daysFromNow(10) } }),
      tenant({ sub: { plan: 'basic', status: 'active', billingCycle: 'monthly', expiresAt: daysFromNow(10) } }),
      tenant({ sub: { plan: 'enterprise', status: 'active', billingCycle: 'yearly', expiresAt: daysFromNow(300) } }),
      // churned in the window
      tenant({ sub: { plan: 'basic', status: 'expired', expiresAt: daysFromNow(-10) } }),
      // lapsed long ago: not churn in this window
      tenant({ sub: { plan: 'basic', status: 'expired', expiresAt: daysFromNow(-90) } }),
      // trial cohort (signed up 30–120 days ago): one converted, one not
      tenant({
        createdAt: daysFromNow(-70),
        sub: {
          plan: 'basic',
          status: 'active',
          expiresAt: daysFromNow(20),
          paymentHistory: [{ amount: 1450, currency: 'PHP', status: 'completed', paidAt: daysFromNow(-20) }],
        },
      }),
      tenant({ createdAt: daysFromNow(-45), sub: { plan: 'trial', status: 'active', expiresAt: daysFromNow(-15) } }),
      // recent sign-up, still in trial
      tenant({ createdAt: daysFromNow(-3) }),
      // a refunded payment does not count as revenue
      tenant({
        sub: {
          plan: 'trial',
          status: 'active',
          expiresAt: daysFromNow(-100),
          paymentHistory: [{ amount: 29, currency: 'USD', status: 'refunded', paidAt: daysFromNow(-5) }],
        },
      }),
    ];

    const m = computePlatformMetrics(rows, NOW);

    expect(m.tenants.total).toBe(9);
    expect(m.tenants.byLifecycle.paying).toBe(4);
    expect(m.mrr).toBeCloseTo(79 + 29 + 1990 / 12 + 29, 2);
    expect(m.arr).toBeCloseTo(m.mrr * 12, 1);
    expect(m.mrrByPlan.find((p) => p.plan === 'basic')).toMatchObject({ clinics: 2, mrr: 58 });

    expect(m.churn).toEqual({ churned: 1, base: 5, rate: 0.2 });
    expect(m.trialConversion).toEqual({ cohort: 2, converted: 1, rate: 0.5 });
    expect(m.signups).toEqual({ last30: 1, previous30: 1 });

    expect(m.revenue).toHaveLength(6);
    expect(m.revenue.at(-1)!.month).toBe('2026-10');
    expect(m.revenue.find((r) => r.month === '2026-09')!.byCurrency).toEqual({ PHP: 1450 });
    expect(m.revenue.flatMap((r) => Object.keys(r.byCurrency))).not.toContain('USD');
  });

  it('reports rates as null when there is nothing to divide by', () => {
    const m = computePlatformMetrics([], NOW);
    expect(m.churn.rate).toBeNull();
    expect(m.trialConversion.rate).toBeNull();
    expect(m.mrr).toBe(0);
  });
});
