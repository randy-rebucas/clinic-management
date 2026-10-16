import { z } from 'zod';
import { zMoney, zObjectId, zShortText, roundMoney } from '@/lib/api/validate';

export const invoiceItemSchema = z.object({
  serviceId: zObjectId.optional(),
  code: zShortText.optional(),
  description: z.string().trim().max(1000).optional(),
  category: zShortText.optional(),
  quantity: z.number().finite().positive().max(100_000),
  unitPrice: zMoney,
});

export const invoiceDiscountSchema = z.object({
  type: z.enum(['pwd', 'senior', 'membership', 'promotional', 'other']),
  reason: zShortText.optional(),
  percentage: z.number().finite().min(0).max(100).optional(),
  amount: zMoney.optional(),
});

export const invoiceInsuranceSchema = z.object({
  provider: zShortText,
  policyNumber: zShortText.optional(),
  memberId: zShortText.optional(),
  coverageType: z.enum(['full', 'partial', 'co-pay']).optional(),
  coverageAmount: zMoney.optional(),
  claimNumber: zShortText.optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'paid']).optional(),
  notes: z.string().max(2000).optional(),
});

/** Fields a client may set when creating or editing an invoice. Totals, payments and status are server-owned. */
export const invoiceEditableSchema = z.object({
  visit: zObjectId.optional().nullable(),
  items: z.array(invoiceItemSchema).max(200),
  professionalFee: zMoney.optional(),
  professionalFeeDoctor: zObjectId.optional().nullable(),
  professionalFeeType: z.enum(['consultation', 'procedure', 'reading', 'other']).optional(),
  professionalFeeNotes: z.string().max(2000).optional(),
  discounts: z.array(invoiceDiscountSchema).max(20).optional(),
  // Only used when the clinic has no tax rate configured.
  tax: zMoney.optional(),
  insurance: invoiceInsuranceSchema.optional(),
});

type Item = z.infer<typeof invoiceItemSchema>;
type Discount = z.infer<typeof invoiceDiscountSchema>;

export interface ComputedTotals {
  items: Array<Item & { total: number }>;
  discounts: Array<Discount & { amount: number; appliedBy?: string }>;
  subtotal: number;
  professionalFee: number;
  tax: number;
  total: number;
}

/**
 * Recompute every money figure server-side. Item totals come from quantity × unitPrice,
 * percentage discounts from the subtotal, fixed discounts are clamped, and the total
 * discount can never exceed the subtotal. Tax uses the clinic's configured rate when set.
 */
export function computeInvoiceTotals(input: {
  items: Item[];
  discounts?: Discount[];
  professionalFee?: number;
  tax?: number;
  taxRate?: number;
  appliedBy?: string;
}): ComputedTotals {
  const items = input.items.map((item) => ({
    ...item,
    total: roundMoney(item.quantity * item.unitPrice),
  }));
  const subtotal = roundMoney(items.reduce((sum, i) => sum + i.total, 0));

  let remaining = subtotal;
  const discounts = (input.discounts || []).map((d) => {
    const raw = d.percentage !== undefined && d.percentage > 0
      ? (subtotal * d.percentage) / 100
      : d.amount ?? 0;
    const amount = roundMoney(Math.min(Math.max(raw, 0), remaining));
    remaining = roundMoney(remaining - amount);
    return { ...d, amount, ...(input.appliedBy ? { appliedBy: input.appliedBy } : {}) };
  });

  const afterDiscount = remaining;
  const professionalFee = roundMoney(input.professionalFee ?? 0);
  const taxRate = Number(input.taxRate) || 0;
  const tax = taxRate > 0
    ? roundMoney((afterDiscount * taxRate) / 100)
    : roundMoney(Math.max(0, input.tax ?? 0));
  const total = roundMoney(afterDiscount + professionalFee + tax);

  return { items, discounts, subtotal, professionalFee, tax, total };
}

export function deriveStatus(total: number, totalPaid: number): 'unpaid' | 'partial' | 'paid' {
  const outstanding = roundMoney(total - totalPaid);
  if (outstanding <= 0 && (total > 0 || totalPaid > 0)) return 'paid';
  if (totalPaid > 0) return 'partial';
  return outstanding <= 0 ? 'paid' : 'unpaid';
}
