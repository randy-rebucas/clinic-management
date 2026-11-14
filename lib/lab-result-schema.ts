import { z } from 'zod';
import { Types } from 'mongoose';
import LabResult from '@/models/LabResult';
import { isSafeRecordKey, zObjectId } from '@/lib/api/validate';
import { nextSequence, formatCode } from '@/lib/counters';

/**
 * Fields staff may set on a lab result. tenantId, requestCode, attachments, notification
 * markers and third-party integration state (endpoint, API key, external ids) are
 * server-controlled.
 */
const optId = z.union([zObjectId, z.literal(''), z.null()]).optional().transform((v) => v || undefined);
const optDate = z.union([z.string().max(40), z.date()]).nullable().optional();
const s = (max = 2000) => z.string().max(max);
/** Test names become object keys (abnormalFlags is a Mongo Map): no "." and no leading "$", or the save throws. */
export const safeAnalyteKey = (k: string) => k.replace(/\./g, '').replace(/^\$+/, '').trim();
function safeKeys<T>(rec: Record<string, T>) {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(rec)) {
    const key = safeAnalyteKey(k);
    if (key && isSafeRecordKey(key)) out[key] = v;
  }
  return out;
}
// Results / reference ranges are free-form key→value maps of numbers or short strings.
const valueMap = z.record(z.string().max(100), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).transform(safeKeys);

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
  abnormalFlags: z.record(z.string().max(100), z.enum(['high', 'low', 'normal'])).transform(safeKeys).optional(),
  status: z.enum(['ordered', 'in-progress', 'completed', 'reviewed', 'cancelled']).optional(),
  reviewedBy: optId,
  reviewedAt: optDate,
});

export const createLabResultSchema = labResultFieldsSchema;
export const updateLabResultSchema = labResultFieldsSchema.partial();

export const MAX_TESTS_PER_ORDER = 30;

/**
 * Several tests ordered together: the shared details once, then the tests. Each test becomes
 * its own lab request (results are entered and reviewed test by test) under one order code.
 */
export const createLabOrderSchema = labResultFieldsSchema
  .pick({ patient: true, visit: true, orderedBy: true, orderDate: true, thirdPartyLab: true })
  .extend({
    status: z.enum(['ordered', 'in-progress']).optional(),
    request: labResultFieldsSchema.shape.request.omit({ testType: true, testCode: true, description: true }).optional(),
    tests: z
      .array(
        z.object({
          testType: z.string().trim().min(1).max(300),
          testCode: s(100).optional(),
          description: s().optional(),
        })
      )
      .min(1)
      .max(MAX_TESTS_PER_ORDER),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.tests.forEach((t, i) => {
      const name = t.testType.toLowerCase();
      if (seen.has(name)) ctx.addIssue({ code: 'custom', path: ['tests', i, 'testType'], message: `${t.testType} is on the order twice` });
      seen.add(name);
    });
  });
export type CreateLabOrder = z.infer<typeof createLabOrderSchema>;

/** Request codes of an order's tests: the order code alone for one test, LAB-000123-1, -2… for several. */
export function orderRequestCodes(orderCode: string, count: number): string[] {
  return count === 1 ? [orderCode] : Array.from({ length: count }, (_, i) => `${orderCode}-${i + 1}`);
}

/** LAB-000123 (counter key 'labRequest'). Used for an order's code; its tests' codes derive from it. */
export async function nextLabRequestCode(tenantId: string | Types.ObjectId): Promise<string> {
  const tid = new Types.ObjectId(String(tenantId));
  const seq = await nextSequence(tid, 'labRequest', async () => {
    // Read the LAB-<n> part only: a test code like LAB-000123-2 must not seed as 2.
    const docs = await LabResult.find({ tenantId: tid, $or: [{ requestCode: { $type: 'string' } }, { orderCode: { $type: 'string' } }] })
      .select('requestCode orderCode')
      .lean<{ requestCode?: string; orderCode?: string }[]>();
    let max = 0;
    for (const d of docs) {
      for (const code of [d.requestCode, d.orderCode]) {
        const m = String(code ?? '').match(/^LAB-(\d+)/i);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
    }
    return max;
  });
  return formatCode('LAB', seq);
}
