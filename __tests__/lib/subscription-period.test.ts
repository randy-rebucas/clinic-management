import { describe, it, expect } from 'vitest';
import { periodEndAfterPayment } from '@/lib/subscription-period';

const NOW = new Date('2026-01-01T00:00:00Z');
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('periodEndAfterPayment', () => {
  it('renewing the same plan extends from the current end', () => {
    const current = { status: 'active', plan: 'basic', billingCycle: 'monthly', expiresAt: new Date('2026-01-31T00:00:00Z') };
    expect(day(periodEndAfterPayment(current, 'monthly', NOW, { plan: 'basic', currency: 'PHP' }))).toBe('2026-02-28');
  });

  it('upgrading converts the unused time at its value, not its length', () => {
    // A year of Basic (₱14,990) just bought, then one month of Enterprise (₱9,999).
    const current = { status: 'active', plan: 'basic', billingCycle: 'yearly', expiresAt: new Date('2027-01-01T00:00:00Z') };
    const end = periodEndAfterPayment(current, 'monthly', NOW, { plan: 'enterprise', currency: 'PHP' });
    // ₱14,990 of Basic is worth about 45 days of Enterprise, plus the month just paid.
    const days = (end.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(70);
    expect(days).toBeLessThan(80);
  });

  it('a trial carries nothing into a paid plan; an ended plan starts now', () => {
    const trial = { status: 'active', plan: 'trial', expiresAt: new Date('2026-01-10T00:00:00Z') };
    expect(day(periodEndAfterPayment(trial, 'monthly', NOW, { plan: 'basic' }))).toBe('2026-02-01');
    const ended = { status: 'expired', plan: 'basic', expiresAt: new Date('2025-12-01T00:00:00Z') };
    expect(day(periodEndAfterPayment(ended, 'monthly', NOW, { plan: 'basic' }))).toBe('2026-02-01');
  });
});
