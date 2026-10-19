import { z } from 'zod';
import { zShortText, zMoney } from '@/lib/api/validate';
import { SERVICE_CATEGORIES } from '@/lib/services';

export { SERVICE_CATEGORIES };

const serviceFields = {
  code: z
    .string()
    .trim()
    .max(50)
    .regex(/^[A-Za-z0-9_-]*$/, 'Code may only contain letters, numbers, - and _')
    .transform((v) => v.toUpperCase())
    .optional(),
  name: zShortText.min(1, 'Enter the service’s name.'),
  description: z.string().trim().max(5000).optional(),
  category: z.enum(SERVICE_CATEGORIES),
  type: zShortText.optional(),
  unitPrice: zMoney,
  unit: zShortText.optional(),
  duration: z.number().int().min(0).max(100_000).optional(),
  requiresDoctor: z.boolean().optional(),
  vatClass: z.enum(['vatable', 'exempt', 'zero_rated']).optional(),
  active: z.boolean().optional(),
  notes: z.string().max(10000).optional(),
};

export const serviceCreateSchema = z.object(serviceFields);

/** On update, '' (and null for the length) clears an optional field. */
export const serviceUpdateSchema = z.object({
  ...serviceFields,
  name: serviceFields.name.optional(),
  category: serviceFields.category.optional(),
  unitPrice: serviceFields.unitPrice.optional(),
  duration: serviceFields.duration.nullable(),
});
