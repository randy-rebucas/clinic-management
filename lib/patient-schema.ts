import { z } from 'zod';
import Patient from '@/models/Patient';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';

/**
 * Next CLINIC-xxxx patient code. patientCode carries a global unique index, so the
 * sequence is global (tenant null) and seeded from the existing CLINIC-n codes.
 */
export async function nextPatientCode(): Promise<string> {
  const seq = await nextSequence(
    null,
    'patientCode',
    maxCodeSeed(Patient, 'patientCode', { patientCode: { $regex: /^CLINIC-\d+$/ } })
  );
  return formatCode('CLINIC', seq, 4);
}

/**
 * Fields staff may set on a patient record. Anything else (tenantIds, patientCode,
 * password, otp*, sessionVersion, loginQrToken*, attachments, readNotificationIds…)
 * is stripped so it can't be mass-assigned from a request body.
 */
const str = (max = 200) => z.string().trim().max(max);
const optDate = z.union([z.string().max(40), z.date()]).nullable().optional();

const addressSchema = z.object({
  street: str().optional(),
  city: str().optional(),
  state: str().optional(),
  zipCode: str(20).optional(),
}).partial();

export const patientFieldsSchema = z.object({
  firstName: str(100).min(1),
  middleName: str(100).nullable().optional(),
  lastName: str(100).min(1),
  suffix: str(20).nullable().optional(),
  dateOfBirth: z.union([z.string().max(40), z.date()]),
  sex: z.enum(['male', 'female', 'other']),
  civilStatus: str(50).nullable().optional(),
  nationality: str(100).nullable().optional(),
  occupation: str(100).nullable().optional(),
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).nullable().optional(),
  phone: str(30).min(1),
  contacts: z.object({ phone: str(30).optional(), email: str(254).optional(), address: str(500).optional() }).partial().optional(),
  address: addressSchema.optional(),
  emergencyContact: z.object({
    name: str().optional(),
    phone: str(30).optional(),
    relationship: str(100).optional(),
    relation: str(100).optional(),
  }).partial().optional(),
  identifiers: z.object({
    philHealth: str(50).optional(),
    govId: str(100).optional(),
    other: z.record(z.string().max(50), z.string().max(200)).optional(),
  }).partial().optional(),
  medicalHistory: str(20000).nullable().optional(),
  preExistingConditions: z.array(z.object({
    condition: str(500),
    diagnosisDate: optDate,
    status: z.enum(['active', 'resolved', 'chronic']).optional(),
    notes: str(2000).optional(),
  })).max(200).optional(),
  allergies: z.array(z.union([
    str(200),
    z.object({ substance: str(200), reaction: str(500).optional(), severity: str(50).optional() }),
  ])).max(200).optional(),
  immunizations: z.array(z.object({
    name: str(200),
    date: optDate,
    batch: str(100).optional(),
    notes: str(2000).optional(),
  })).max(200).optional(),
  socialHistory: z.object({
    smoker: z.enum(['never', 'former', 'current', 'unknown']).optional(),
    alcohol: z.enum(['none', 'social', 'regular', 'unknown']).optional(),
    drugs: z.enum(['none', 'occasional', 'regular', 'unknown']).optional(),
    notes: str(2000).optional(),
  }).partial().optional(),
  // Stored as a Mongo Map: keys may not contain "." or start with "$", or the save throws.
  familyHistory: z
    .record(z.string().max(100), z.string().max(500))
    .transform((rec) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(rec)) {
        const key = k.replace(/\./g, '').replace(/^\$+/, '').trim();
        if (key) out[key] = out[key] ? `${out[key]}, ${v}` : v;
      }
      return out;
    })
    .optional(),
  discountEligibility: z.object({
    pwd: z.object({ eligible: z.boolean(), idNumber: str(100).optional(), expiryDate: optDate }).optional(),
    senior: z.object({ eligible: z.boolean(), idNumber: str(100).optional() }).optional(),
    membership: z.object({
      eligible: z.boolean(),
      membershipType: str(100).optional(),
      membershipNumber: str(100).optional(),
      expiryDate: optDate,
      discountPercentage: z.number().min(0).max(100).optional(),
    }).optional(),
  }).partial().optional(),
  active: z.boolean().optional(),
  tags: z.array(str(50)).max(50).optional(),
  segmentFlags: z.object({
    isVIP: z.boolean().optional(),
    isHighRisk: z.boolean().optional(),
    isHighUtilizer: z.boolean().optional(),
    hasRecurringNoShow: z.boolean().optional(),
    isPendingVerification: z.boolean().optional(),
    hasOutstandingBalance: z.boolean().optional(),
  }).partial().optional(),
});

export const createPatientSchema = patientFieldsSchema;
export const updatePatientSchema = patientFieldsSchema.partial();

/** Drop empty strings / nulls / empty containers the forms send for untouched optional fields. */
export function cleanPatientInput<T extends Record<string, any>>(input: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === '' || value === null) continue;
    if (Array.isArray(value) && value.length === 0 && key !== 'tags' && key !== 'allergies') continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Blank sub-fields (an untouched PhilHealth box, an empty emergency contact) are not stored.
      const kept = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      if (Object.keys(kept).length === 0) continue;
      out[key] = kept;
      continue;
    }
    out[key] = value;
  }
  return out as Partial<T>;
}
