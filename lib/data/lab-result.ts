/**
 * Data-access layer for the LabResult model (Phase 5 Batch 4 — clinical
 * core). LabResult carries a direct `tenantId` column
 * (DIRECTLY_SCOPED_MODELS in lib/prisma-tenant-extension.ts) — standard
 * runWithTenant(tenantId, fn) scoping applies.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migrateLabResults(): the Mongoose `request`/`thirdPartyLab` embedded 1:1
 * structs were flattened to `request*`/`thirdParty*` columns (see
 * prisma/MIGRATION_NOTES.md). toLabResultDTO() re-nests them under
 * `request`/`thirdPartyLab` keys so existing frontend/print-template code
 * (`labResult.request.testType`, `labResult.thirdPartyLab.labName`, etc.)
 * keeps working. flattenLabResultInput() does the inverse for create/update.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const labResultInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, email: true, phone: true, dateOfBirth: true, sex: true } },
  visit: { select: { id: true, visitCode: true, date: true, visitType: true, chiefComplaint: true, soapAssessment: true, diagnoses: true } },
  orderedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  attachments: true,
} satisfies Prisma.LabResultInclude;

type LabResultWithRelations = Prisma.LabResultGetPayload<{ include: typeof labResultInclude }>;

/** Re-nest the request/thirdPartyLab flattened columns under their Mongoose-era keys. */
export function toLabResultDTO(labResult: LabResultWithRelations) {
  const {
    id,
    requestTestType,
    requestTestCode,
    requestDescription,
    requestUrgency,
    requestSpecialInstructions,
    requestFastingRequired,
    requestPreparationNotes,
    thirdPartyLabName,
    thirdPartyLabId,
    thirdPartyLabCode,
    thirdPartyIntegrationType,
    thirdPartyApiEndpoint,
    thirdPartyApiKey,
    thirdPartyExternalRequestId,
    thirdPartyExternalResultId,
    thirdPartyStatus,
    thirdPartySentAt,
    thirdPartyReceivedAt,
    thirdPartyErrorMessage,
    ...rest
  } = labResult;

  const hasThirdParty = Boolean(thirdPartyLabName || thirdPartyLabId || thirdPartyStatus);

  return {
    _id: id,
    id,
    ...rest,
    request: {
      testType: requestTestType,
      testCode: requestTestCode,
      description: requestDescription,
      urgency: requestUrgency,
      specialInstructions: requestSpecialInstructions,
      fastingRequired: requestFastingRequired,
      preparationNotes: requestPreparationNotes,
    },
    thirdPartyLab: hasThirdParty
      ? {
          labName: thirdPartyLabName,
          labId: thirdPartyLabId,
          labCode: thirdPartyLabCode,
          integrationType: thirdPartyIntegrationType,
          apiEndpoint: thirdPartyApiEndpoint,
          apiKey: thirdPartyApiKey,
          externalRequestId: thirdPartyExternalRequestId,
          externalResultId: thirdPartyExternalResultId,
          status: thirdPartyStatus,
          sentAt: thirdPartySentAt,
          receivedAt: thirdPartyReceivedAt,
          errorMessage: thirdPartyErrorMessage,
        }
      : undefined,
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. */
export function flattenLabResultInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };

  const request = body.request;
  if (request) {
    flat.requestTestType = request.testType;
    flat.requestTestCode = request.testCode ?? undefined;
    flat.requestDescription = request.description ?? undefined;
    flat.requestUrgency = request.urgency ?? 'routine';
    flat.requestSpecialInstructions = request.specialInstructions ?? undefined;
    flat.requestFastingRequired = request.fastingRequired ?? false;
    flat.requestPreparationNotes = request.preparationNotes ?? undefined;
  }
  delete flat.request;

  const thirdPartyLab = body.thirdPartyLab;
  if (thirdPartyLab) {
    flat.thirdPartyLabName = thirdPartyLab.labName ?? undefined;
    flat.thirdPartyLabId = thirdPartyLab.labId ?? undefined;
    flat.thirdPartyLabCode = thirdPartyLab.labCode ?? undefined;
    flat.thirdPartyIntegrationType = thirdPartyLab.integrationType ?? undefined;
    flat.thirdPartyApiEndpoint = thirdPartyLab.apiEndpoint ?? undefined;
    flat.thirdPartyApiKey = thirdPartyLab.apiKey ?? undefined;
    flat.thirdPartyExternalRequestId = thirdPartyLab.externalRequestId ?? undefined;
    flat.thirdPartyExternalResultId = thirdPartyLab.externalResultId ?? undefined;
    flat.thirdPartyStatus = thirdPartyLab.status ?? undefined;
    flat.thirdPartySentAt = thirdPartyLab.sentAt ?? undefined;
    flat.thirdPartyReceivedAt = thirdPartyLab.receivedAt ?? undefined;
    flat.thirdPartyErrorMessage = thirdPartyLab.errorMessage ?? undefined;
  }
  delete flat.thirdPartyLab;

  delete flat.attachments;
  delete flat.patient;
  delete flat.visit;
  delete flat.orderedBy;
  delete flat.reviewedBy;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;

  return flat;
}

export interface LabResultFilter {
  patientId?: string;
  visitId?: string;
  status?: string;
}

export function buildLabResultWhere(filter: LabResultFilter): Prisma.LabResultWhereInput {
  const where: Prisma.LabResultWhereInput = {};
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.visitId) where.visitId = filter.visitId;
  if (filter.status) where.status = filter.status as Prisma.LabResultWhereInput['status'];
  return where;
}

export async function listLabResults(where: Prisma.LabResultWhereInput) {
  const results = await prisma.labResult.findMany({
    where,
    include: labResultInclude,
    orderBy: { orderDate: 'desc' },
  });
  return results.map(toLabResultDTO);
}

export async function getLabResultById(id: string) {
  const result = await prisma.labResult.findUnique({ where: { id }, include: labResultInclude });
  return result ? toLabResultDTO(result) : null;
}

export function findLabResultByExternalRequestId(externalRequestId: string) {
  return prisma.labResult.findFirst({ where: { thirdPartyExternalRequestId: externalRequestId } });
}

export async function createLabResult(data: Prisma.LabResultCreateInput) {
  const result = await prisma.labResult.create({ data, include: labResultInclude });
  return toLabResultDTO(result);
}

export async function updateLabResult(id: string, data: Prisma.LabResultUpdateInput) {
  const result = await prisma.labResult.update({ where: { id }, data, include: labResultInclude });
  return toLabResultDTO(result);
}

export function findLabResultRawById(id: string) {
  return prisma.labResult.findUnique({ where: { id } });
}

/** Highest existing `LAB-######` code number, for auto-generation (tenant-scoped by the active context). */
export async function getMaxLabResultCodeNumber(): Promise<number> {
  const last = await prisma.labResult.findFirst({
    where: { requestCode: { not: null } },
    orderBy: { requestCode: 'desc' },
    select: { requestCode: true },
  });
  if (!last?.requestCode) return 0;
  const match = last.requestCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// ── Automation / reporting support (lib/automations/*) ───────────────────────

export function countLabResultsInRange(start: Date, end: Date) {
  return prisma.labResult.count({ where: { createdAt: { gte: start, lte: end } } });
}

/** Hard-delete every lab result for a patient — PH DPA "delete" compliance mode (app/api/compliance/data-deletion). */
export async function deleteLabResultsByPatient(patientId: string): Promise<number> {
  const result = await prisma.labResult.deleteMany({ where: { patientId } });
  return result.count;
}

export async function addLabResultAttachment(
  labResultId: string,
  attachment: {
    filename: string;
    contentType?: string;
    size?: number;
    url?: string;
    uploadedById?: string;
    notes?: string;
  }
) {
  const result = await prisma.labResult.update({
    where: { id: labResultId },
    data: { attachments: { create: attachment } },
    include: labResultInclude,
  });
  return toLabResultDTO(result);
}
