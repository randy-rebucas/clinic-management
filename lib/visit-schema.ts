import { z } from 'zod';
import { zObjectId } from '@/lib/api/validate';

/**
 * Fields staff may set on a visit. tenantId, visitCode, attachments, feedback tokens,
 * reminder flags and signature metadata (providerId/signedAt/ipAddress) are server-controlled.
 */
const text = (max = 20000) => z.string().max(max);
const optDate = z.union([z.string().max(40), z.date()]).nullable().optional();
const num = z.union([z.number(), z.string().max(20), z.null()]).optional();

/** Vital signs as captured at triage (queue) or in the visit. */
export const vitalsSchema = z.object({
  bp: z.string().max(20).nullable().optional(),
  hr: num,
  rr: num,
  tempC: num,
  spo2: num,
  heightCm: num,
  weightKg: num,
  bmi: num,
}).partial();

export const visitFieldsSchema = z.object({
  patient: zObjectId,
  date: optDate,
  provider: zObjectId.optional(),
  visitType: z.enum(['consultation', 'follow-up', 'checkup', 'emergency', 'teleconsult', 'vaccination']).optional(),
  chiefComplaint: text().optional(),
  historyOfPresentIllness: text().optional(),
  admittingImpression: text().optional(),
  vitals: vitalsSchema.optional(),
  physicalExam: z.record(z.string().max(50), z.string().max(5000).nullable()).optional(),
  diagnoses: z.array(z.object({
    code: z.string().max(20).optional(),
    description: z.string().max(1000).optional(),
    primary: z.boolean().optional(),
  })).max(100).optional(),
  assessment: text().optional(),
  plan: text().optional(),
  soapNotes: z.object({
    subjective: text().optional(),
    objective: text().optional(),
    assessment: text().optional(),
    plan: text().optional(),
  }).partial().optional(),
  treatmentPlan: z.object({
    medications: z.array(z.object({
      name: z.string().max(300),
      dosage: z.string().max(200).optional(),
      frequency: z.string().max(200).optional(),
      duration: z.string().max(200).optional(),
      quantity: z.coerce.number().min(0).max(100000).optional(),
      instructions: z.string().max(2000).optional(),
    })).max(100).optional(),
    procedures: z.array(z.object({
      name: z.string().max(300),
      description: z.string().max(2000).optional(),
      scheduledDate: optDate,
    })).max(100).optional(),
    lifestyle: z.array(z.object({
      category: z.string().max(100).optional(),
      instructions: z.string().max(2000).optional(),
    })).max(100).optional(),
    followUp: z.object({
      date: optDate,
      instructions: z.string().max(2000).optional(),
    }).partial().optional(),
  }).partial().optional(),
  digitalSignature: z.object({
    providerName: z.string().max(200).optional(),
    signatureData: z.string().max(2_000_000).optional(),
  }).optional(),
  prescriptions: z.array(zObjectId).max(200).optional(),
  labsOrdered: z.array(zObjectId).max(200).optional(),
  imagingOrdered: z.array(zObjectId).max(200).optional(),
  proceduresPerformed: z.array(zObjectId).max(200).optional(),
  notes: text().optional(),
  followUpDate: optDate,
  status: z.enum(['draft', 'open', 'closed', 'cancelled']).optional(),
  archived: z.boolean().optional(),
});

export const createVisitSchema = visitFieldsSchema;
export const updateVisitSchema = visitFieldsSchema.partial();

/** Server-side signature metadata; the client only supplies the name and image. */
export function signatureWithMetadata(
  sig: { providerName?: string; signatureData?: string } | undefined,
  userId: string,
  request: Request
) {
  if (!sig) return undefined;
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  return { ...sig, providerId: userId, signedAt: new Date(), ipAddress: clientIp };
}
