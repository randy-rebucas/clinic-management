/**
 * Invoice arithmetic, shared by the API (which stores the figures) and the invoice form (which
 * previews them), so the total a cashier sees before saving is the total that gets saved.
 * Pure functions only: no database or framework imports.
 */

export type DiscountType = 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';

/** How a charge is treated for VAT (NIRC §106–109). */
export type VatClass = 'vatable' | 'exempt' | 'zero_rated';
export const VAT_CLASSES: VatClass[] = ['vatable', 'exempt', 'zero_rated'];

export interface TotalsItem {
  quantity: number;
  unitPrice: number;
  vatClass?: VatClass;
}

export interface TotalsDiscount {
  type: DiscountType;
  reason?: string;
  percentage?: number;
  amount?: number;
}

/**
 * The clinic's BIR registration as the arithmetic needs it. Without one, invoices use the
 * clinic's flat tax rate (the behaviour before BIR invoicing existed).
 */
export interface TaxProfile {
  regime: 'vat' | 'non_vat';
  /** Percent; 12 in the Philippines. */
  vatRate: number;
  /** Price-list prices already include VAT (usual for over-the-counter sales). */
  pricesIncludeVat: boolean;
  professionalFeeVatClass: VatClass;
}

/** The figures a BIR invoice prints. Every amount is in the invoice currency, to centavos. */
export interface TaxBreakdown {
  regime: 'vat' | 'non_vat';
  /** Services plus professional fee, as priced, before any discount or VAT adjustment. */
  grossSales: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  /** Senior/PWD sales only: the VAT taken out because the sale is VAT-exempt. */
  lessVat: number;
  /** Senior/PWD discount taken from the amount net of VAT. */
  statutoryDiscount: number;
}

/** Senior citizen (RA 9994) and PWD (RA 10754) discounts: set by law, not by the clinic. */
export const isStatutoryDiscount = (type: string) => type === 'senior' || type === 'pwd';

/**
 * Why a set of discounts can't go on one BIR invoice, or null. A senior citizen or PWD takes
 * either the statutory discount or another promo, whichever is higher, never both (RA 9994 §4),
 * and one person is billed under one of the two.
 */
export function statutoryDiscountProblem(discounts: { type: string }[] | undefined): string | null {
  const list = discounts ?? [];
  const statutory = list.filter((d) => isStatutoryDiscount(d.type));
  if (statutory.length > 1) return 'Apply either the senior citizen or the PWD discount, not both.';
  if (statutory.length === 1 && list.length > 1) {
    return 'A senior citizen or PWD discount can’t be combined with another discount; keep whichever is higher.';
  }
  return null;
}

/** Round a currency amount to centavos. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface InvoiceTotals<I, D> {
  items: (I & { total: number })[];
  discounts: (D & { amount: number; appliedBy?: string })[];
  subtotal: number;
  professionalFee: number;
  tax: number;
  total: number;
  /** Present when the clinic invoices under a BIR registration. */
  breakdown?: TaxBreakdown;
}

/**
 * Recompute every money figure. Item totals come from quantity × unitPrice, percentage discounts
 * from the subtotal, fixed discounts are clamped, and the discounts together can never exceed the
 * subtotal. Tax uses the clinic's configured rate when set, otherwise the amount entered.
 *
 * With a tax profile (BIR invoicing on) the rules follow Philippine tax law instead; see
 * {@link computeWithTaxProfile}.
 */
export function computeInvoiceTotals<I extends TotalsItem, D extends TotalsDiscount>(input: {
  items: I[];
  discounts?: D[];
  professionalFee?: number;
  tax?: number;
  taxRate?: number;
  appliedBy?: string;
  taxProfile?: TaxProfile | null;
  /**
   * What PhilHealth pays on this bill. A senior citizen or PWD discount is taken from what is
   * left after it (RA 9994 IRR), so the benefit is deducted before the 20%.
   */
  payerDeduction?: number;
}): InvoiceTotals<I, D> {
  if (input.taxProfile) return computeWithTaxProfile({ ...input, taxProfile: input.taxProfile });

  const items = input.items.map((item) => ({
    ...item,
    total: roundMoney(item.quantity * item.unitPrice),
  }));
  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.total, 0));

  let remaining = subtotal;
  const deduction = Math.max(0, Number(input.payerDeduction) || 0);
  const discounts = (input.discounts || []).map((d) => {
    // With PhilHealth on the bill, the statutory 20% is of what PhilHealth leaves.
    const base = isStatutoryDiscount(d.type) && deduction > 0 ? Math.max(0, subtotal - deduction) : subtotal;
    const raw = d.percentage !== undefined && d.percentage > 0 ? (base * d.percentage) / 100 : d.amount ?? 0;
    const amount = roundMoney(Math.min(Math.max(raw, 0), remaining));
    remaining = roundMoney(remaining - amount);
    return { ...d, amount, ...(input.appliedBy ? { appliedBy: input.appliedBy } : {}) };
  });

  const afterDiscount = remaining;
  const professionalFee = roundMoney(input.professionalFee ?? 0);
  const taxRate = Number(input.taxRate) || 0;
  const tax = taxRate > 0 ? roundMoney((afterDiscount * taxRate) / 100) : roundMoney(Math.max(0, input.tax ?? 0));
  const total = roundMoney(afterDiscount + professionalFee + tax);

  return { items, discounts, subtotal, professionalFee, tax, total };
}

/**
 * Philippine invoicing rules.
 *
 * - VAT-registered: each charge is VATable, VAT-exempt or zero-rated. VAT is worked out from the
 *   price (inclusive) or added to it (exclusive). Ordinary discounts reduce the services, not the
 *   professional fee, and are spread over the services in proportion to their price.
 * - Non-VAT: no VAT; the invoice states the total only.
 * - Senior citizen / PWD: the sale is VAT-exempt, so the VAT comes out of VAT-inclusive prices
 *   first, then the 20% is taken from that amount, professional fee included (RA 9994 §4(a),
 *   RA 10754 §5). Any other discount on the same invoice counts for nothing.
 */
function computeWithTaxProfile<I extends TotalsItem, D extends TotalsDiscount>(input: {
  items: I[];
  discounts?: D[];
  professionalFee?: number;
  appliedBy?: string;
  taxProfile: TaxProfile;
  payerDeduction?: number;
}): InvoiceTotals<I, D> {
  const p = input.taxProfile;
  const vat = p.regime === 'vat';
  const rate = vat ? Math.max(0, Number(p.vatRate) || 0) / 100 : 0;
  const inclusive = vat && p.pricesIncludeVat;
  const stamp = input.appliedBy ? { appliedBy: input.appliedBy } : {};

  const items = input.items.map((item) => ({
    ...item,
    vatClass: item.vatClass ?? 'vatable',
    total: roundMoney(item.quantity * item.unitPrice),
  }));
  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.total, 0));
  const professionalFee = roundMoney(input.professionalFee ?? 0);
  const grossSales = roundMoney(subtotal + professionalFee);
  const lines: { amount: number; cls: VatClass; service: boolean }[] = [
    ...items.map((i) => ({ amount: i.total, cls: i.vatClass as VatClass, service: true })),
    ...(professionalFee > 0 ? [{ amount: professionalFee, cls: p.professionalFeeVatClass, service: false }] : []),
  ];

  const statutory = (input.discounts || []).find((d) => isStatutoryDiscount(d.type));
  if (statutory) {
    // VAT-exempt sale: strip VAT from VAT-inclusive VATable prices, then take the discount.
    const netOf = (l: { amount: number; cls: VatClass }) => (inclusive && l.cls === 'vatable' ? l.amount / (1 + rate) : l.amount);
    const base = roundMoney(lines.reduce((s, l) => s + netOf(l), 0));
    const zeroRated = roundMoney(lines.filter((l) => l.cls === 'zero_rated').reduce((s, l) => s + l.amount, 0));
    // PhilHealth's benefit comes off first; the 20% is of the rest (RA 9994 IRR).
    const discountBase = Math.max(0, base - Math.max(0, Number(input.payerDeduction) || 0));
    const raw = statutory.percentage !== undefined && statutory.percentage > 0 ? (discountBase * Math.min(100, statutory.percentage)) / 100 : statutory.amount ?? 0;
    const statutoryAmount = roundMoney(Math.min(Math.max(raw, 0), discountBase));
    const discounts = (input.discounts || []).map((d) => ({ ...d, amount: d === statutory ? statutoryAmount : 0, ...stamp }));
    return {
      items,
      discounts,
      subtotal,
      professionalFee,
      tax: 0,
      total: roundMoney(base - statutoryAmount),
      breakdown: {
        regime: p.regime,
        grossSales,
        vatableSales: 0,
        vatAmount: 0,
        vatExemptSales: roundMoney(base - zeroRated),
        zeroRatedSales: zeroRated,
        lessVat: roundMoney(grossSales - base),
        statutoryDiscount: statutoryAmount,
      },
    };
  }

  let remaining = subtotal;
  const discounts = (input.discounts || []).map((d) => {
    const raw = d.percentage !== undefined && d.percentage > 0 ? (subtotal * d.percentage) / 100 : d.amount ?? 0;
    const amount = roundMoney(Math.min(Math.max(raw, 0), remaining));
    remaining = roundMoney(remaining - amount);
    return { ...d, amount, ...stamp };
  });
  const factor = subtotal > 0 ? remaining / subtotal : 0;

  let charged = 0;
  let vatAmount = 0;
  let exempt = 0;
  let zero = 0;
  for (const l of lines) {
    const after = l.service ? l.amount * factor : l.amount;
    if (vat && l.cls === 'vatable') {
      const added = inclusive ? 0 : after * rate;
      vatAmount += inclusive ? after - after / (1 + rate) : added;
      charged += after + added;
    } else {
      if (l.cls === 'zero_rated' && vat) zero += after;
      else if (vat) exempt += after;
      charged += after;
    }
  }
  const total = roundMoney(charged);
  const vatR = roundMoney(vatAmount);
  const exemptR = roundMoney(exempt);
  const zeroR = roundMoney(zero);

  return {
    items,
    discounts,
    subtotal,
    professionalFee,
    tax: vatR,
    total,
    breakdown: {
      regime: p.regime,
      grossSales,
      // The remainder, so the four figures always add up to the total exactly.
      vatableSales: vat ? roundMoney(total - vatR - exemptR - zeroR) : 0,
      vatAmount: vatR,
      vatExemptSales: exemptR,
      zeroRatedSales: zeroR,
      lessVat: 0,
      statutoryDiscount: 0,
    },
  };
}

export function deriveStatus(total: number, totalPaid: number): 'unpaid' | 'partial' | 'paid' {
  const outstanding = roundMoney(total - totalPaid);
  if (outstanding <= 0 && (total > 0 || totalPaid > 0)) return 'paid';
  if (totalPaid > 0) return 'partial';
  return outstanding <= 0 ? 'paid' : 'unpaid';
}
