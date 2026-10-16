/**
 * Invoice arithmetic, shared by the API (which stores the figures) and the invoice form (which
 * previews them), so the total a cashier sees before saving is the total that gets saved.
 * Pure functions only: no database or framework imports.
 */

export type DiscountType = 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';

export interface TotalsItem {
  quantity: number;
  unitPrice: number;
}

export interface TotalsDiscount {
  type: DiscountType;
  reason?: string;
  percentage?: number;
  amount?: number;
}

/** Round a currency amount to centavos. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Recompute every money figure. Item totals come from quantity × unitPrice, percentage discounts
 * from the subtotal, fixed discounts are clamped, and the discounts together can never exceed the
 * subtotal. Tax uses the clinic's configured rate when set, otherwise the amount entered.
 */
export function computeInvoiceTotals<I extends TotalsItem, D extends TotalsDiscount>(input: {
  items: I[];
  discounts?: D[];
  professionalFee?: number;
  tax?: number;
  taxRate?: number;
  appliedBy?: string;
}) {
  const items = input.items.map((item) => ({
    ...item,
    total: roundMoney(item.quantity * item.unitPrice),
  }));
  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.total, 0));

  let remaining = subtotal;
  const discounts = (input.discounts || []).map((d) => {
    const raw = d.percentage !== undefined && d.percentage > 0 ? (subtotal * d.percentage) / 100 : d.amount ?? 0;
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

export function deriveStatus(total: number, totalPaid: number): 'unpaid' | 'partial' | 'paid' {
  const outstanding = roundMoney(total - totalPaid);
  if (outstanding <= 0 && (total > 0 || totalPaid > 0)) return 'paid';
  if (totalPaid > 0) return 'partial';
  return outstanding <= 0 ? 'paid' : 'unpaid';
}
