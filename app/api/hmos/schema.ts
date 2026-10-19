import { z } from 'zod';
import { zShortText } from '@/lib/api/validate';

const rate = z.coerce.number().finite().min(0).max(100);

export const hmoFields = {
  name: zShortText.min(1, 'Enter the HMO’s name.'),
  kind: z.enum(['hmo', 'insurer', 'company']).optional(),
  code: z.string().trim().max(50).optional(),
  contactName: zShortText.optional(),
  email: z.union([z.literal(''), z.string().trim().email('That doesn’t look like an email address.').max(254)]).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(3650).optional(),
  withholdingServicesRate: rate.optional(),
  withholdingProfessionalRate: rate.optional(),
  requiresLoa: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
  active: z.boolean().optional(),
};

export const hmoCreateSchema = z.object(hmoFields);
export const hmoUpdateSchema = z.object({ ...hmoFields, name: hmoFields.name.optional() });

export const HMO_FIELDS = 'name kind code contactName email phone address paymentTermsDays withholdingServicesRate withholdingProfessionalRate requiresLoa notes active';
