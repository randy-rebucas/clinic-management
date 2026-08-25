/**
 * Data-access layer for Document. Document is a DIRECTLY_SCOPED_MODEL in
 * lib/prisma-tenant-extension.ts (has its own tenantId column, nullable).
 *
 * Every function here assumes the caller has already established tenant
 * context via runWithTenant(tenantId, fn) or runAsSystem(fn).
 *
 * Shape: Mongoose embedded referral/imaging/medicalCertificate/labResultMetadata
 * sub-objects are flattened to referral-, imaging-, medCert-, and labMeta-
 * prefixed columns. toDocumentDTO() reconstructs the nested shape the
 * frontend still expects.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

const fullInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
  uploadedBy: { select: { id: true, name: true } },
  lastModifiedBy: { select: { id: true, name: true } },
  visit: { select: { id: true, visitCode: true, date: true } },
  appointment: { select: { id: true, appointmentCode: true } },
  labResult: { select: { id: true, requestCode: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.DocumentInclude;

export type DocumentWithRelations = Prisma.DocumentGetPayload<{ include: typeof fullInclude }>;

export function toDocumentDTO(doc: DocumentWithRelations) {
  const {
    referralReferringDoctor,
    referralReferringClinic,
    referralDate,
    referralReason,
    imagingModality,
    imagingBodyPart,
    imagingStudyDate,
    imagingRadiologist,
    medCertIssueDate,
    medCertValidUntil,
    medCertPurpose,
    medCertRestrictions,
    labMetaTestType,
    labMetaTestDate,
    labMetaLabName,
    patientId,
    uploadedById,
    lastModifiedById,
    visitId,
    appointmentId,
    labResultId,
    invoiceId,
    ...rest
  } = doc;

  const hasReferral = referralReferringDoctor || referralReferringClinic || referralDate || referralReason;
  const hasImaging = imagingModality || imagingBodyPart || imagingStudyDate || imagingRadiologist;
  const hasMedCert = medCertIssueDate || medCertValidUntil || medCertPurpose || medCertRestrictions;
  const hasLabMeta = labMetaTestType || labMetaTestDate || labMetaLabName;

  return {
    _id: doc.id,
    ...rest,
    patient: doc.patient ?? patientId,
    uploadedBy: doc.uploadedBy ?? uploadedById,
    lastModifiedBy: doc.lastModifiedBy ?? lastModifiedById,
    visit: doc.visit ?? visitId,
    appointment: doc.appointment ?? appointmentId,
    labResult: doc.labResult ?? labResultId,
    invoice: doc.invoice ?? invoiceId,
    referral: hasReferral
      ? {
          referringDoctor: referralReferringDoctor ?? undefined,
          referringClinic: referralReferringClinic ?? undefined,
          referralDate: referralDate ?? undefined,
          reason: referralReason ?? undefined,
        }
      : undefined,
    imaging: hasImaging
      ? {
          modality: imagingModality ?? undefined,
          bodyPart: imagingBodyPart ?? undefined,
          studyDate: imagingStudyDate ?? undefined,
          radiologist: imagingRadiologist ?? undefined,
        }
      : undefined,
    medicalCertificate: hasMedCert
      ? {
          issueDate: medCertIssueDate ?? undefined,
          validUntil: medCertValidUntil ?? undefined,
          purpose: medCertPurpose ?? undefined,
          restrictions: medCertRestrictions ?? undefined,
        }
      : undefined,
    labResultMetadata: hasLabMeta
      ? {
          testType: labMetaTestType ?? undefined,
          testDate: labMetaTestDate ?? undefined,
          labName: labMetaLabName ?? undefined,
        }
      : undefined,
  };
}

/** Flatten the category-specific nested payloads the frontend sends into their column names. */
export function flattenDocumentCategoryInput(input: {
  referral?: Record<string, any> | null;
  imaging?: Record<string, any> | null;
  medicalCertificate?: Record<string, any> | null;
  labResultMetadata?: Record<string, any> | null;
}): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.referral) {
    out.referralReferringDoctor = input.referral.referringDoctor ?? undefined;
    out.referralReferringClinic = input.referral.referringClinic ?? undefined;
    out.referralDate = input.referral.referralDate ?? undefined;
    out.referralReason = input.referral.reason ?? undefined;
  }
  if (input.imaging) {
    out.imagingModality = input.imaging.modality ?? undefined;
    out.imagingBodyPart = input.imaging.bodyPart ?? undefined;
    out.imagingStudyDate = input.imaging.studyDate ?? undefined;
    out.imagingRadiologist = input.imaging.radiologist ?? undefined;
  }
  if (input.medicalCertificate) {
    out.medCertIssueDate = input.medicalCertificate.issueDate ?? undefined;
    out.medCertValidUntil = input.medicalCertificate.validUntil ?? undefined;
    out.medCertPurpose = input.medicalCertificate.purpose ?? undefined;
    out.medCertRestrictions = input.medicalCertificate.restrictions ?? undefined;
  }
  if (input.labResultMetadata) {
    out.labMetaTestType = input.labResultMetadata.testType ?? undefined;
    out.labMetaTestDate = input.labResultMetadata.testDate ?? undefined;
    out.labMetaLabName = input.labResultMetadata.labName ?? undefined;
  }
  return out;
}

export interface ListDocumentsFilter {
  patientId?: string;
  category?: string;
  documentType?: string;
  status?: string;
  visitId?: string;
  search?: string;
}

export function buildDocumentWhere(filter: ListDocumentsFilter): Prisma.DocumentWhereInput {
  const where: Prisma.DocumentWhereInput = {};
  if (filter.status) where.status = filter.status as Prisma.EnumDocumentStatusFilter['equals'];
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.category) where.category = filter.category as Prisma.EnumDocumentCategoryFilter['equals'];
  if (filter.documentType) where.documentType = filter.documentType as Prisma.EnumDocumentTypeFilter['equals'];
  if (filter.visitId) where.visitId = filter.visitId;
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
      { ocrText: { contains: filter.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export async function listDocuments(where: Prisma.DocumentWhereInput, take?: number) {
  const [items, total] = await Promise.all([
    prisma.document.findMany({ where, include: fullInclude, orderBy: { uploadDate: 'desc' }, take }),
    prisma.document.count({ where }),
  ]);
  return { items: items.map(toDocumentDTO), total };
}

export async function getDocumentById(id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: fullInclude });
  return doc ? toDocumentDTO(doc) : null;
}

/** Raw (no include) fetch — used by download/stream/view routes that only need file fields. */
export async function getDocumentRaw(id: string) {
  return prisma.document.findUnique({ where: { id } });
}

export interface CreateDocumentInput extends Record<string, any> {
  patientId?: string;
  visitId?: string;
  uploadedById: string;
}

export async function createDocument(input: CreateDocumentInput) {
  const { referral, imaging, medicalCertificate, labResultMetadata, patientId, visitId, uploadedById, ...rest } = input;
  const doc = await prisma.document.create({
    data: {
      ...rest,
      ...flattenDocumentCategoryInput({ referral, imaging, medicalCertificate, labResultMetadata }),
      patient: patientId ? { connect: { id: patientId } } : undefined,
      visit: visitId ? { connect: { id: visitId } } : undefined,
      uploadedBy: { connect: { id: uploadedById } },
    } as Prisma.DocumentCreateInput,
    include: fullInclude,
  });
  return toDocumentDTO(doc as DocumentWithRelations);
}

export async function updateDocument(id: string, body: Record<string, any>) {
  const { referral, imaging, medicalCertificate, labResultMetadata, patient, uploadedBy, lastModifiedBy, visit, appointment, labResult, invoice, patientId, uploadedById, lastModifiedById, visitId, appointmentId, labResultId, invoiceId, _id, id: _bodyId, ...rest } = body;

  const data: Prisma.DocumentUpdateInput = {
    ...rest,
    ...flattenDocumentCategoryInput({ referral, imaging, medicalCertificate, labResultMetadata }),
  };
  if (lastModifiedById !== undefined) data.lastModifiedBy = lastModifiedById ? { connect: { id: lastModifiedById } } : { disconnect: true };

  const doc = await prisma.document.update({ where: { id }, data, include: fullInclude });
  return toDocumentDTO(doc);
}

export async function softDeleteDocument(id: string, lastModifiedById: string) {
  const doc = await prisma.document.update({
    where: { id },
    data: { status: 'deleted', lastModifiedBy: { connect: { id: lastModifiedById } }, lastModifiedDate: new Date() },
    include: fullInclude,
  });
  return toDocumentDTO(doc);
}

/** Bulk-mark all of a patient's documents as deleted — PH DPA "delete" compliance mode (app/api/compliance/data-deletion). */
export async function markDocumentsDeletedByPatient(patientId: string): Promise<number> {
  const result = await prisma.document.updateMany({
    where: { patientId },
    data: { status: 'deleted', lastModifiedDate: new Date() },
  });
  return result.count;
}

// ── Automation support (lib/automations/document-expiry-tracking.ts) ────────

/** Bulk-archive (status -> 'archived') documents uploaded before `before` that aren't already archived (data-retention cron). */
export async function bulkArchiveDocumentsBefore(before: Date): Promise<number> {
  const result = await prisma.document.updateMany({
    where: { uploadDate: { lt: before }, status: { not: 'archived' } },
    data: { status: 'archived', lastModifiedDate: new Date() },
  });
  return result.count;
}

/** Documents with an expiryDate between `from` and `to`, with their patient (for expiry alerts). */
export function listDocumentsExpiringInRange(from: Date, to: Date) {
  return prisma.document.findMany({
    where: { expiryDate: { gte: from, lte: to } },
    include: { patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
  });
}

export async function markDocumentScanned(id: string, ocrText: string | undefined, lastModifiedById: string) {
  const doc = await prisma.document.update({
    where: { id },
    data: {
      scanned: true,
      ocrText: ocrText || undefined,
      lastModifiedBy: { connect: { id: lastModifiedById } },
      lastModifiedDate: new Date(),
    },
    include: fullInclude,
  });
  return toDocumentDTO(doc);
}
