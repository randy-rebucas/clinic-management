import { z } from 'zod';
import { zMoney } from '@/lib/api/validate';

const fields = {
  code: z.string().trim().min(1, 'Enter the ICD-10, RVS or package code.').max(30).transform((v) => v.toUpperCase()),
  kind: z.enum(['medical', 'procedure', 'package']).default('medical'),
  description: z.string().trim().min(1, 'Describe the case.').max(300),
  amount: zMoney,
  hciShare: zMoney.default(0),
  pfShare: zMoney.default(0),
  active: z.boolean().optional(),
};

const splitAddsUp = (v: { amount?: number; hciShare?: number; pfShare?: number }) =>
  v.amount === undefined || (v.hciShare ?? 0) + (v.pfShare ?? 0) <= v.amount + 0.005;
const message = { message: 'The facility and professional-fee shares add up to more than the case rate.', path: ['pfShare'] };

export const caseRateSchema = z.object(fields).refine(splitAddsUp, message);
export const caseRateUpdateSchema = z
  .object({ ...fields, code: fields.code.optional(), kind: z.enum(['medical', 'procedure', 'package']).optional(), description: fields.description.optional(), amount: zMoney.optional(), hciShare: zMoney.optional(), pfShare: zMoney.optional() })
  .refine(splitAddsUp, message);
