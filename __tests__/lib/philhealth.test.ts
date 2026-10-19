import { describe, it, expect } from 'vitest';
import { daysToFile, formatPin, isPin, philhealthBenefit } from '@/lib/philhealth';
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
