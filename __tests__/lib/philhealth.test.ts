import { describe, it, expect } from 'vitest';
import { RTH_DAYS, daysLeftToFile, paidStatusFor, daysToFile, deadlineOf, formatPin, isPin, philhealthBenefit, waitOf } from '@/lib/philhealth';
import { computeInvoiceTotals } from '@/lib/invoice-totals';

describe('PhilHealth number', () => {
  it('takes 12 digits in any spacing and prints them 2-9-1', () => {
    expect(isPin('12-345678901-2')).toBe(true);
    expect(isPin('123456789012')).toBe(true);
    expect(isPin('12345')).toBe(false);
    expect(formatPin('123456789012')).toBe('12-345678901-2');
  });
});

describe('philhealthBenefit', () => {
  it('caps each share at the matching charge', () => {
    expect(philhealthBenefit({ amount: 5000, hciShare: 3500, pfShare: 1500 }, { services: 2000, professionalFee: 3000 })).toEqual({ hciAmount: 2000, pfAmount: 1500, total: 3500 });
  });
  it('caps an unsplit rate at the whole bill', () => {
    expect(philhealthBenefit({ amount: 4000, hciShare: 0, pfShare: 0 }, { services: 2500, professionalFee: 500 })).toEqual({ hciAmount: 3000, pfAmount: 0, total: 3000 });
  });
});

describe('senior citizen discount after PhilHealth', () => {
  it('takes the 20% from what PhilHealth leaves (non-VAT clinic)', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 10_000 }],
      professionalFee: 0,
      discounts: [{ type: 'senior', percentage: 20 }],
      taxProfile: { regime: 'non_vat', vatRate: 12, pricesIncludeVat: true, professionalFeeVatClass: 'vatable' },
      payerDeduction: 6_000,
    });
    // 10,000 − 6,000 PhilHealth = 4,000; 20% of that = 800
    expect(t.discounts[0].amount).toBe(800);
    expect(t.total).toBe(9_200);
  });

  it('does the same without BIR invoicing', () => {
    const t = computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: 10_000 }], discounts: [{ type: 'pwd', percentage: 20 }], payerDeduction: 6_000 });
    expect(t.discounts[0].amount).toBe(800);
  });

  it('leaves other discounts on the full bill', () => {
    const t = computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: 10_000 }], discounts: [{ type: 'promotional', percentage: 10 }], payerDeduction: 6_000 });
    expect(t.discounts[0].amount).toBe(1_000);
  });
});

describe('daysToFile', () => {
  it('counts down the filing window and goes negative once late', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    expect(daysToFile('2026-10-01T00:00:00Z', 60, now)).toBe(42);
    expect(daysToFile('2026-08-01T00:00:00Z', 60, now)).toBe(-19);
  });
});

describe('filing deadline', () => {
  it('gives a returned claim 60 calendar days from the notice, whatever the clinic’s own window', () => {
    const now = new Date('2026-10-19T00:00:00Z');
    const returned = { servedOn: '2026-07-01T00:00:00Z', returnedAt: '2026-10-10T00:00:00Z' };
    expect(RTH_DAYS).toBe(60);
    expect(daysLeftToFile(returned, 30, now)).toBe(51);
    expect(daysLeftToFile({ servedOn: returned.servedOn }, 30, now)).toBeLessThan(0);
    expect(daysLeftToFile({ servedOn: '2026-10-10T00:00:00Z' }, 30, now)).toBe(21);
  });

  it('sorts days left and days waiting into the page’s buckets', () => {
    expect([-1, 0, 7, 8, 30, 31].map(deadlineOf)).toEqual(['late', 'week', 'week', 'month', 'month', 'later']);
    expect([0, 30, 31, 60, 61, 90, 91].map(waitOf)).toEqual(['0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '90+']);
  });
});

describe('PhilHealth payment', () => {
  it('is part paid when PhilHealth pays less than the claim, tax withheld included', () => {
    expect(paidStatusFor(1000, 980, 20)).toBe('paid');
    expect(paidStatusFor(1000, 900, 20)).toBe('part_paid');
    expect(paidStatusFor(1000, 999.996, 0)).toBe('paid');
  });
});
