import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals, statutoryDiscountProblem, type TaxProfile } from '@/lib/invoice-totals';
import { birSetupProblems, formatSerial, formatTin, taxProfileOf, BIR_DEFAULTS } from '@/lib/bir';

const VAT_INCL: TaxProfile = { regime: 'vat', vatRate: 12, pricesIncludeVat: true, professionalFeeVatClass: 'vatable' };
const VAT_EXCL: TaxProfile = { ...VAT_INCL, pricesIncludeVat: false };
const NON_VAT: TaxProfile = { ...VAT_INCL, regime: 'non_vat' };

describe('computeInvoiceTotals without a tax profile', () => {
  it('keeps the flat-rate behaviour', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 2, unitPrice: 50 }],
      discounts: [{ type: 'promotional', percentage: 10 }],
      professionalFee: 300,
      taxRate: 5,
    });
    expect(t.subtotal).toBe(100);
    expect(t.discounts[0].amount).toBe(10);
    expect(t.tax).toBe(4.5);
    expect(t.total).toBe(394.5);
    expect(t.breakdown).toBeUndefined();
  });
});

describe('computeInvoiceTotals, VAT-registered', () => {
  it('works VAT out of inclusive prices', () => {
    const t = computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: 112 }], taxProfile: VAT_INCL });
    expect(t.total).toBe(112);
    expect(t.breakdown).toMatchObject({ vatableSales: 100, vatAmount: 12, vatExemptSales: 0, zeroRatedSales: 0 });
    expect(t.tax).toBe(12);
  });

  it('adds VAT to exclusive prices', () => {
    const t = computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: 100 }], professionalFee: 500, taxProfile: VAT_EXCL });
    expect(t.total).toBe(672);
    expect(t.breakdown).toMatchObject({ vatableSales: 600, vatAmount: 72 });
  });

  it('spreads an ordinary discount over the services, not the professional fee', () => {
    const t = computeInvoiceTotals({
      items: [
        { quantity: 2, unitPrice: 112, vatClass: 'vatable' },
        { quantity: 1, unitPrice: 100, vatClass: 'exempt' },
      ],
      discounts: [{ type: 'promotional', percentage: 10 }],
      professionalFee: 560,
      taxProfile: VAT_INCL,
    });
    // services 324, less 32.40 = 291.60 (vatable 201.60, exempt 90) + PF 560
    expect(t.discounts[0].amount).toBe(32.4);
    expect(t.total).toBe(851.6);
    expect(t.breakdown).toMatchObject({ vatAmount: 81.6, vatExemptSales: 90, vatableSales: 680 });
    const b = t.breakdown!;
    expect(b.vatableSales + b.vatAmount + b.vatExemptSales + b.zeroRatedSales).toBeCloseTo(t.total, 2);
  });

  it('makes a senior citizen sale VAT-exempt and takes 20% of the price net of VAT, professional fee included', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 112 }],
      professionalFee: 560,
      discounts: [{ type: 'senior', percentage: 20 }],
      taxProfile: VAT_INCL,
    });
    // 672 gross → 600 net of VAT → less 120 → 480
    expect(t.total).toBe(480);
    expect(t.tax).toBe(0);
    expect(t.discounts[0].amount).toBe(120);
    expect(t.breakdown).toMatchObject({ grossSales: 672, lessVat: 72, vatExemptSales: 600, vatAmount: 0, vatableSales: 0, statutoryDiscount: 120 });
  });

  it('gives another discount alongside a statutory one no value', () => {
    const t = computeInvoiceTotals({
      items: [{ quantity: 1, unitPrice: 112 }],
      discounts: [
        { type: 'pwd', percentage: 20 },
        { type: 'promotional', amount: 50 },
      ],
      taxProfile: VAT_INCL,
    });
    expect(t.discounts.map((d) => d.amount)).toEqual([20, 0]);
    expect(t.total).toBe(80);
  });
});

describe('computeInvoiceTotals, non-VAT', () => {
  it('carries no VAT', () => {
    const t = computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: 100 }], professionalFee: 500, taxRate: 12, taxProfile: NON_VAT });
    expect(t.total).toBe(600);
    expect(t.tax).toBe(0);
    expect(t.breakdown).toMatchObject({ regime: 'non_vat', vatAmount: 0, vatableSales: 0 });
  });

  it('takes the statutory 20% from services and professional fee', () => {
    const t = computeInvoiceTotals({ items: [{ quantity: 1, unitPrice: 100 }], professionalFee: 500, discounts: [{ type: 'senior', percentage: 20 }], taxProfile: NON_VAT });
    expect(t.total).toBe(480);
    expect(t.breakdown?.lessVat).toBe(0);
  });
});

describe('statutoryDiscountProblem', () => {
  it('allows one statutory discount on its own', () => {
    expect(statutoryDiscountProblem([{ type: 'senior' }])).toBeNull();
    expect(statutoryDiscountProblem([{ type: 'promotional' }, { type: 'membership' }])).toBeNull();
  });
  it('refuses senior with PWD, or with another discount', () => {
    expect(statutoryDiscountProblem([{ type: 'senior' }, { type: 'pwd' }])).toMatch(/not both/);
    expect(statutoryDiscountProblem([{ type: 'pwd' }, { type: 'membership' }])).toMatch(/combined/);
  });
});

describe('BIR helpers', () => {
  it('formats a TIN with its branch code', () => {
    expect(formatTin('123456789', '0')).toBe('123-456-789-00000');
    expect(formatTin('123-456-789-001', '00000')).toBe('123-456-789-001');
  });
  it('formats serials', () => {
    expect(formatSerial('SI', 42)).toBe('SI-0000042');
    expect(formatSerial('', 1)).toBe('0000001');
  });
  it('is off until enabled', () => {
    expect(taxProfileOf(undefined)).toBeUndefined();
    expect(taxProfileOf({ ...BIR_DEFAULTS, enabled: true, regime: 'vat' })).toMatchObject({ regime: 'vat', vatRate: 12 });
  });
  it('lists what is missing before invoicing can start', () => {
    const missing = birSetupProblems({ ...BIR_DEFAULTS, enabled: true }, '');
    expect(missing.join(' ')).toMatch(/TIN/);
    expect(missing.join(' ')).toMatch(/permit/);
    expect(birSetupProblems({ ...BIR_DEFAULTS, enabled: true, permitNumber: 'AC-1' }, '123456789')).toEqual([]);
  });
});
