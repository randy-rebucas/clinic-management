import { z } from 'zod';
import { Types } from 'mongoose';
import LabResult from '@/models/LabResult';
import { zObjectId } from '@/lib/api/validate';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';

/**
 * Fields staff may set on a lab result. tenantId, requestCode, attachments, notification
 * markers and third-party integration state (endpoint, API key, external ids) are
 * server-controlled.
 */
const optId = z.union([zObjectId, z.literal(''), z.null()]).optional().transform((v) => v || undefined);
const optDate = z.union([z.string().max(40), z.date()]).nullable().optional();
const s = (max = 2000) => z.string().max(max);
// Results / reference ranges are free-form key→value maps of numbers or short strings.
const valueMap = z.record(z.string().max(100), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]));

export const labResultFieldsSchema = z.object({
  patient: zObjectId,
  visit: optId,
  orderedBy: optId,
  orderDate: optDate,
  request: z.object({
    testType: z.string().trim().min(1).max(300),
    testCode: s(100).optional(),
    description: s().optional(),
    urgency: z.enum(['routine', 'urgent', 'stat']).optional(),
    specialInstructions: s().optional(),
    fastingRequired: z.boolean().optional(),
    preparationNotes: s().optional(),
  }),
  thirdPartyLab: z.object({
    labName: z.string().trim().min(1).max(300),
    labId: s(100).optional(),
    labCode: s(100).optional(),
    integrationType: z.enum(['manual', 'api', 'hl7', 'other']).optional(),
  }).optional(),
  results: valueMap.optional(),
  resultDate: optDate,
  interpretation: s(20000).optional(),
  referenceRanges: valueMap.optional(),
  abnormalFlags: z.record(z.string().max(100), z.enum(['high', 'low', 'normal'])).optional(),
  status: z.enum(['ordered', 'in-progress', 'completed', 'reviewed', 'cancelled']).optional(),
  reviewedBy: optId,
  reviewedAt: optDate,
});

export const createLabResultSchema = labResultFieldsSchema;
export const updateLabResultSchema = labResultFieldsSchema.partial();

/** LAB-000123 (counter key 'labRequest'). */
export async function nextLabRequestCode(tenantId: string | Types.ObjectId): Promise<string> {
  const tid = new Types.ObjectId(String(tenantId));
  const seq = await nextSequence(
    tid,
    'labRequest',
    maxCodeSeed(LabResult, 'requestCode', { tenantId: tid, requestCode: { $exists: true, $ne: null } })
  );
  return formatCode('LAB', seq);
}
