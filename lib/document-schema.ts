import { z } from 'zod';
import { zObjectId } from '@/lib/api/validate';

export const DOCUMENT_CATEGORIES = [
  'referral', 'laboratory_result', 'imaging', 'medical_certificate', 'prescription', 'invoice', 'id', 'insurance', 'other',
] as const;

const optDate = z.union([z.string().max(40), z.date()]).nullable().optional();
const s = (max = 500) => z.string().max(max);

export const referralMetaSchema = z.object({
  referringDoctor: s(200).optional(),
  referringClinic: s(200).optional(),
  referralDate: optDate,
  reason: s(2000).optional(),
}).partial();

export const imagingMetaSchema = z.object({
  modality: s(100).optional(),
  bodyPart: s(100).optional(),
  studyDate: optDate,
  radiologist: s(200).optional(),
}).partial();

export const medicalCertificateMetaSchema = z.object({
  issueDate: optDate,
  validUntil: optDate,
  purpose: s(200).optional(),
  restrictions: s(2000).optional(),
}).partial();

export const labResultMetaSchema = z.object({
  testType: s(200).optional(),
  testDate: optDate,
  labName: s(200).optional(),
}).partial();

/**
 * Editable document metadata. The stored file (url, contentType, size, filename,
 * thumbnailUrl, metadata) is immutable after upload; tenantId/documentCode/uploader too.
 */
export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: s(5000).optional(),
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  patient: zObjectId.nullable().optional(),
  visit: zObjectId.nullable().optional(),
  appointment: zObjectId.nullable().optional(),
  labResult: zObjectId.nullable().optional(),
  invoice: zObjectId.nullable().optional(),
  tags: z.array(s(50)).max(50).optional(),
  expiryDate: optDate,
  referral: referralMetaSchema.optional(),
  imaging: imagingMetaSchema.optional(),
  medicalCertificate: medicalCertificateMetaSchema.optional(),
  labResultMetadata: labResultMetaSchema.optional(),
  status: z.enum(['active', 'archived']).optional(),
  isConfidential: z.boolean().optional(),
  notes: s(5000).optional(),
});
