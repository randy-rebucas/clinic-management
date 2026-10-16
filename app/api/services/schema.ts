import { z } from 'zod';
import { zShortText, zMoney } from '@/lib/api/validate';

export const SERVICE_CATEGORIES = ['consultation', 'procedure', 'laboratory', 'imaging', 'medication', 'other'] as const;

const serviceFields = {
  code: z.string().trim().max(50).regex(/^[A-Za-z0-9_-]*$/, 'Code may only contain letters, numbers, - and _').optional(),
  name: zShortText.min(1),
  description: z.string().trim().max(5000).optional(),
  category: z.enum(SERVICE_CATEGORIES),
  type: zShortText.optional(),
  unitPrice: zMoney,
  unit: zShortText.optional(),
  duration: z.number().finite().min(0).max(100_000).optional(),
  requiresDoctor: z.boolean().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(10000).optional(),
};

export const serviceCreateSchema = z.object(serviceFields);

export const serviceUpdateSchema = z.object({
  ...serviceFields,
  name: serviceFields.name.optional(),
  category: serviceFields.category.optional(),
  unitPrice: serviceFields.unitPrice.optional(),
});
