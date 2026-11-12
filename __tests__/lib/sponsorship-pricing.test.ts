import { describe, it, expect } from 'vitest';
import { DEFAULT_SPONSORSHIP_PRICING, isSponsorTerm, sponsorshipPrice, sponsorshipQuotes, termLabel } from '@/lib/sponsorship-pricing';
import { sponsorshipPricingSchema } from '@/lib/platform-config-schema';

describe('sponsorship pricing', () => {
  it('charges ₱2,500 a month with 5 / 10 / 15 % off for 3 / 6 / 12 months', () => {
    expect(sponsorshipQuotes().map((q) => [q.months, q.amount, q.percentOff])).toEqual([
      [1, 2500, 0],
      [3, 7125, 5],
      [6, 13500, 10],
      [12, 25500, 15],
    ]);
    expect(sponsorshipPrice(12)).toMatchObject({ fullPrice: 30000, perMonth: 2125, currency: 'PHP' });
  });

  it('rounds configured prices to whole pesos', () => {
    const q = sponsorshipPrice(3, { monthly: 1999, discounts: { '3': 7.5, '6': 0, '12': 0 } });
    expect(q.amount).toBe(5547); // 5997 × 0.925 = 5547.225
    expect(sponsorshipPrice(6, { monthly: 1999, discounts: { '3': 7.5, '6': 0, '12': 0 } }).amount).toBe(11994);
  });

  it('accepts only the four terms', () => {
    expect([1, 3, 6, 12].every(isSponsorTerm)).toBe(true);
    expect([0, 2, 24, '3', null].some(isSponsorTerm)).toBe(false);
    expect([1, 3, 12].map(termLabel)).toEqual(['1 month', '3 months', '1 year']);
  });

  it('platform admins can save the defaults, but not a free month or an over-50% discount', () => {
    expect(sponsorshipPricingSchema.safeParse(DEFAULT_SPONSORSHIP_PRICING).success).toBe(true);
    expect(sponsorshipPricingSchema.safeParse({ ...DEFAULT_SPONSORSHIP_PRICING, monthly: 0 }).success).toBe(false);
    expect(sponsorshipPricingSchema.safeParse({ monthly: 2500, discounts: { '3': 5, '6': 10, '12': 60 } }).success).toBe(false);
  });
});
