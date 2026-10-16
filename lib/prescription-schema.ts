import { z } from 'zod';
import { zObjectId } from '@/lib/api/validate';

/**
 * Fields staff may set on a prescription. tenantId, prescriptionCode, dispense records
 * and copy/archive tracking are server-controlled; status changes to dispensed go
 * through the dispense endpoint.
 */
const optId = z.union([zObjectId, z.literal(''), z.null()]).optional().transform((v) => v || undefined);
const s = (max = 500) => z.string().max(max);

export const medicationSchema = z.object({
  medicineId: optId,
  name: z.string().trim().min(1).max(300),
  genericName: s(300).optional(),
  form: s(100).optional(),
  strength: s(100).optional(),
  dose: s(100).optional(),
  route: s(100).optional(),
  frequency: s(200).optional(),
  durationDays: z.coerce.number().min(0).max(3650).optional().nullable(),
  quantity: z.coerce.number().min(0).max(100000).optional().nullable(),
  instructions: s(2000).optional(),
  calculatedDosage: z.object({
    dose: s(200).optional(),
    frequency: s(200).optional(),
    totalDailyDose: s(200).optional(),
    instructions: s(2000).optional(),
  }).partial().optional(),
});

export const prescriptionFieldsSchema = z.object({
  patient: zObjectId,
  visit: optId,
  prescribedBy: optId,
  medications: z.array(medicationSchema).min(1).max(100),
  notes: s(20000).optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  digitalSignature: z.object({
    providerName: s(200).optional(),
    signatureData: z.string().max(2_000_000).optional(),
  }).optional(),
  drugInteractions: z.array(z.object({
    medication1: s(300),
    medication2: s(300),
    severity: z.enum(['mild', 'moderate', 'severe', 'contraindicated']),
    description: s(2000),
    recommendation: s(2000).optional(),
  })).max(200).optional(),
});

export const createPrescriptionSchema = prescriptionFieldsSchema;
export const updatePrescriptionSchema = prescriptionFieldsSchema.partial();
