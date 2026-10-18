import { z } from 'zod';
import { zShortText } from '@/lib/api/validate';
import { MEDICINE_FORMS, MEDICINE_ROUTES } from '@/lib/medicines';

/** A short list (brand names, uses, cautions): blanks dropped, repeats folded. */
const zList = z
  .array(zShortText)
  .max(50)
  .transform((items) => {
    const seen = new Set<string>();
    return items.filter((i) => i && !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()));
  });

const zBound = (max: number) => z.number().finite().min(0).max(max).nullable().optional();

const doseRange = z
  .object({
    minAge: zBound(130),
    maxAge: zBound(130),
    minWeight: zBound(500),
    maxWeight: zBound(500),
    dose: zShortText.min(1, 'Enter the dose for this age or weight.'),
    frequency: zShortText.min(1, 'Enter how often for this age or weight.'),
    maxDailyDose: zShortText.optional(),
  })
  .refine((r) => r.minAge == null || r.maxAge == null || r.minAge <= r.maxAge, { message: 'The youngest age is above the oldest.', path: ['maxAge'] })
  .refine((r) => r.minWeight == null || r.maxWeight == null || r.minWeight <= r.maxWeight, { message: 'The lowest weight is above the highest.', path: ['maxWeight'] });

const medicineFields = {
  name: zShortText.min(1, 'Enter the medicine’s name, as it should print on the prescription.'),
  genericName: zShortText.optional(),
  brandNames: zList.optional(),
  form: z.enum(MEDICINE_FORMS),
  strength: zShortText.min(1, 'Enter the strength, e.g. 500mg or 250mg/5ml.'),
  route: z.enum(MEDICINE_ROUTES),
  category: zShortText.min(1, 'Enter a category, e.g. Antibiotic.'),
  indications: zList.optional(),
  contraindications: zList.optional(),
  sideEffects: zList.optional(),
  dosageRanges: z.array(doseRange).max(20).optional(),
  standardDosage: zShortText.optional(),
  standardFrequency: zShortText.optional(),
  duration: zShortText.optional(),
  requiresPrescription: z.boolean().optional(),
  controlledSubstance: z.boolean().optional(),
  schedule: zShortText.optional(),
  active: z.boolean().optional(),
};

export const medicineCreateSchema = z.object(medicineFields).strict();

/** On update every field is optional; '' clears an optional text field. */
export const medicineUpdateSchema = z.object(medicineFields).partial().strict();
