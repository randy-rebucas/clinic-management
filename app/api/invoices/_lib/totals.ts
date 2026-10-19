import { z } from 'zod';
import { zMoney, zObjectId, zShortText } from '@/lib/api/validate';

// The arithmetic lives in lib/ so the invoice form previews exactly what the API stores.
export { computeInvoiceTotals, deriveStatus, statutoryDiscountProblem } from '@/lib/invoice-totals';
export { taxProfileOf } from '@/lib/bir';
import { invoicePhilhealthSchema } from './philhealth';

export const invoiceItemSchema = z.object({
  serviceId: zObjectId.optional(),
  code: zShortText.optional(),
  description: z.string().trim().max(1000).optional(),
  category: zShortText.optional(),
  quantity: z.number().finite().positive().max(100_000),
  unitPrice: zMoney,
  vatClass: z.enum(['vatable', 'exempt', 'zero_rated']).optional(),
});

export const invoiceDiscountSchema = z.object({
  type: z.enum(['pwd', 'senior', 'membership', 'promotional', 'other']),
  reason: zShortText.optional(),
  idNumber: zShortText.optional(),
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
  /** From the clinic's HMO directory; the provider name is then taken from it. */
  hmo: zObjectId.optional(),
  loaNumber: zShortText.optional(),
  loaDate: z.coerce.date().optional(),
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
  /** A PhilHealth claim; null takes it off (only while it hasn't been filed). */
  philhealth: invoicePhilhealthSchema.optional().nullable(),
});
