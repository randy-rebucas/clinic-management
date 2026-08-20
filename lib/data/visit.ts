/**
 * Data-access layer for the Visit model (Phase 5 Batch 4 — clinical core,
 * the largest model in the batch). Visit carries a direct `tenantId` column
 * (DIRECTLY_SCOPED_MODELS in lib/prisma-tenant-extension.ts) — standard
 * runWithTenant(tenantId, fn) scoping applies.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 *
 * Child-relation writes: diagnoses / treatmentMedications /
 * treatmentProcedures / treatmentLifestyle / digitalSignature / attachments
 * are all separate child tables (see prisma/MIGRATION_NOTES.md's "Visit"
 * section). createVisit()/updateVisit() use Prisma's nested-write API
 * (`data: { diagnoses: { create: [...] }, ... }`) inside a single
 * `prisma.visit.create()`/`update()` call — Prisma wraps nested writes in
 * an implicit transaction automatically, so no manual $transaction is
 * needed (per the plan's stated preference).
 *
 * Prescription/LabResult/Imaging/Procedure orders are NOT array-of-refs on
 * Visit in the Prisma schema (that Mongoose field was dropped per
 * MIGRATION_NOTES.md) — they are reverse relations driven by each child
 * model's own `visitId` FK: `visit.prescriptions`, `visit.labsOrdered`,
 * `visit.imagingOrdered`, `visit.proceduresPerformed`. This module includes
 * them as read-only reverse relations (mirroring the old
 * `.populate('prescriptions').populate('labsOrdered')...` calls) — creating
 * new prescriptions/lab results/imaging/procedures is done through their
 * own lib/data modules (lib/data/prescription.ts, lib/data/lab-result.ts)
 * or, for Imaging/Procedure (no dedicated routes in this batch), directly
 * via `prisma.imaging.create({ data: { visitId, ... } })` /
 * `prisma.procedure.create(...)` at the call site.
 *
 * Queue is explicitly OUT of scope for this batch (Phase 5 "supporting
 * models" batch owns it) — nothing here touches the Queue model.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migrateVisits(): vitals/physicalExam/soapNotes were flattened;
 * treatmentPlan.medications/.procedures/.lifestyle became child tables;
 * treatmentPlan.followUp was flattened; digitalSignature became a 1:1 child
 * table (all-or-nothing row presence). toVisitDTO() re-nests all of these
 * under their Mongoose-era keys for frontend/print-template compatibility.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const visitInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, email: true, phone: true, dateOfBirth: true, sex: true } },
  provider: { select: { id: true, name: true, email: true } },
  diagnoses: true,
  treatmentMedications: true,
  treatmentProcedures: true,
  treatmentLifestyle: true,
  digitalSignature: true,
  attachments: true,
  prescriptions: { include: { medications: true } },
  labsOrdered: true,
  imagingOrdered: { include: { images: true } },
  proceduresPerformed: { include: { attachments: true } },
} satisfies Prisma.VisitInclude;

type VisitWithRelations = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

/** Re-nest flattened vitals/physicalExam/soapNotes/treatmentPlan columns under their Mongoose-era keys. */
export function toVisitDTO(visit: VisitWithRelations) {
  const {
    id,
    vitalsBp,
    vitalsHr,
    vitalsRr,
    vitalsTempC,
    vitalsSpo2,
    vitalsHeightCm,
    vitalsWeightKg,
    vitalsBmi,
    peGeneral,
    peHeadEent,
    peHeent,
    peChest,
    peLungs,
    peCardiovascular,
    peAbdomen,
    peExtremities,
    peNeuro,
    peNeurological,
    peSkin,
    peLymphNotes,
    peBreast,
    peRectum,
    peGenitalia,
    peMusculoskeletal,
    peOther,
    soapSubjective,
    soapObjective,
    soapAssessment,
    soapPlan,
    treatmentMedications,
    treatmentProcedures,
    treatmentLifestyle,
    treatmentFollowUpDate,
    treatmentFollowUpInstructions,
    treatmentFollowUpReminderSent,
    digitalSignature,
    ...rest
  } = visit;

  return {
    _id: id,
    id,
    ...rest,
    vitals: {
      bp: vitalsBp,
      hr: vitalsHr,
      rr: vitalsRr,
      tempC: vitalsTempC,
      spo2: vitalsSpo2,
      heightCm: vitalsHeightCm,
      weightKg: vitalsWeightKg,
      bmi: vitalsBmi,
    },
    physicalExam: {
      general: peGeneral,
      headEent: peHeadEent,
      heent: peHeent,
      chest: peChest,
      lungs: peLungs,
      cardiovascular: peCardiovascular,
      abdomen: peAbdomen,
      extremities: peExtremities,
      neuro: peNeuro,
      neurological: peNeurological,
      skin: peSkin,
      lymphNotes: peLymphNotes,
      breast: peBreast,
      rectum: peRectum,
      genitalia: peGenitalia,
      musculoskeletal: peMusculoskeletal,
      other: peOther,
    },
    soapNotes: {
      subjective: soapSubjective,
      objective: soapObjective,
      assessment: soapAssessment,
      plan: soapPlan,
    },
    treatmentPlan: {
      medications: treatmentMedications,
      procedures: treatmentProcedures,
      lifestyle: treatmentLifestyle,
      followUp: {
        date: treatmentFollowUpDate,
        instructions: treatmentFollowUpInstructions,
        reminderSent: treatmentFollowUpReminderSent,
      },
    },
    digitalSignature: digitalSignature ?? undefined,
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. Relation arrays/1:1 children are handled separately by the caller. */
export function flattenVisitInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };

  const vitals = body.vitals;
  if (vitals) {
    flat.vitalsBp = vitals.bp ?? undefined;
    flat.vitalsHr = vitals.hr ?? undefined;
    flat.vitalsRr = vitals.rr ?? undefined;
    flat.vitalsTempC = vitals.tempC ?? undefined;
    flat.vitalsSpo2 = vitals.spo2 ?? undefined;
    flat.vitalsHeightCm = vitals.heightCm ?? undefined;
    flat.vitalsWeightKg = vitals.weightKg ?? undefined;
    flat.vitalsBmi = vitals.bmi ?? undefined;
  }
  delete flat.vitals;

  const pe = body.physicalExam;
  if (pe) {
    flat.peGeneral = pe.general ?? undefined;
    flat.peHeadEent = pe.headEent ?? undefined;
    flat.peHeent = pe.heent ?? undefined;
    flat.peChest = pe.chest ?? undefined;
    flat.peLungs = pe.lungs ?? undefined;
    flat.peCardiovascular = pe.cardiovascular ?? undefined;
    flat.peAbdomen = pe.abdomen ?? undefined;
    flat.peExtremities = pe.extremities ?? undefined;
    flat.peNeuro = pe.neuro ?? undefined;
    flat.peNeurological = pe.neurological ?? undefined;
    flat.peSkin = pe.skin ?? undefined;
    flat.peLymphNotes = pe.lymphNotes ?? undefined;
    flat.peBreast = pe.breast ?? undefined;
    flat.peRectum = pe.rectum ?? undefined;
    flat.peGenitalia = pe.genitalia ?? undefined;
    flat.peMusculoskeletal = pe.musculoskeletal ?? undefined;
    flat.peOther = pe.other ?? undefined;
  }
  delete flat.physicalExam;

  const soap = body.soapNotes;
  if (soap) {
    flat.soapSubjective = soap.subjective ?? undefined;
    flat.soapObjective = soap.objective ?? undefined;
    flat.soapAssessment = soap.assessment ?? undefined;
    flat.soapPlan = soap.plan ?? undefined;
  }
  delete flat.soapNotes;

  const followUp = body.treatmentPlan?.followUp;
  if (followUp) {
    flat.treatmentFollowUpDate = followUp.date ?? undefined;
    flat.treatmentFollowUpInstructions = followUp.instructions ?? undefined;
    flat.treatmentFollowUpReminderSent = followUp.reminderSent ?? false;
  }

  const digitalSignature = body.digitalSignature;
  if (digitalSignature) {
    // Handled as a nested 1:1 write by the caller (create/update), not a flat column.
  }

  delete flat.treatmentPlan;
  delete flat.digitalSignature;
  delete flat.diagnoses;
  delete flat.attachments;
  delete flat.prescriptions;
  delete flat.labsOrdered;
  delete flat.imagingOrdered;
  delete flat.proceduresPerformed;
  delete flat.patient;
  delete flat.provider;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;

  return flat;
}

function buildDiagnosisCreates(diagnoses: any[] | undefined): Prisma.VisitDiagnosisCreateWithoutVisitInput[] {
  if (!Array.isArray(diagnoses)) return [];
  return diagnoses.map((d) => ({ code: d.code ?? undefined, description: d.description ?? undefined, primary: d.primary ?? false }));
}

function buildTreatmentMedicationCreates(meds: any[] | undefined): Prisma.VisitTreatmentMedicationCreateWithoutVisitInput[] {
  if (!Array.isArray(meds)) return [];
  return meds.map((m) => ({
    name: m.name,
    dosage: m.dosage ?? undefined,
    frequency: m.frequency ?? undefined,
    duration: m.duration ?? undefined,
    quantity: m.quantity ?? undefined,
    instructions: m.instructions ?? undefined,
  }));
}

function buildTreatmentProcedureCreates(procs: any[] | undefined): Prisma.VisitTreatmentProcedureCreateWithoutVisitInput[] {
  if (!Array.isArray(procs)) return [];
  return procs.map((p) => ({ name: p.name, description: p.description ?? undefined, scheduledDate: p.scheduledDate ?? undefined }));
}

function buildTreatmentLifestyleCreates(items: any[] | undefined): Prisma.VisitTreatmentLifestyleCreateWithoutVisitInput[] {
  if (!Array.isArray(items)) return [];
  return items.map((l) => ({ category: l.category ?? undefined, instructions: l.instructions }));
}

export interface VisitFilter {
  patientId?: string;
  providerId?: string;
  status?: string;
  date?: string;
}

export function buildVisitWhere(filter: VisitFilter): Prisma.VisitWhereInput {
  const where: Prisma.VisitWhereInput = {};
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.providerId) where.providerId = filter.providerId;
  if (filter.status) where.status = filter.status as Prisma.VisitWhereInput['status'];
  if (filter.date) {
    const startOfDay = new Date(filter.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filter.date);
    endOfDay.setHours(23, 59, 59, 999);
    where.date = { gte: startOfDay, lte: endOfDay };
  }
  return where;
}

export async function listVisits(where: Prisma.VisitWhereInput, take?: number) {
  const visits = await prisma.visit.findMany({
    where,
    include: visitInclude,
    orderBy: { date: 'desc' },
    take: take && take > 0 ? take : undefined,
  });
  return visits.map(toVisitDTO);
}

export async function getVisitById(id: string) {
  const visit = await prisma.visit.findUnique({ where: { id }, include: visitInclude });
  return visit ? toVisitDTO(visit) : null;
}

export function findVisitRawById(id: string) {
  return prisma.visit.findUnique({ where: { id } });
}

/**
 * Look up a visit by its (globally unique) feedbackToken — used by the
 * public, unauthenticated /api/feedback/[token] flow. Callers must run this
 * under runAsSystem() since there is no session-derived tenant at that point.
 */
export function findVisitByFeedbackToken(token: string) {
  return prisma.visit.findUnique({
    where: { feedbackToken: token },
    select: {
      id: true,
      date: true,
      visitType: true,
      status: true,
      tenantId: true,
      patientId: true,
      provider: { select: { name: true } },
    },
  });
}

/**
 * Create a visit with all of its child relations in one atomic nested-write
 * call: diagnoses, treatmentMedications/Procedures/Lifestyle, an optional
 * digitalSignature row, and attachments.
 */
export async function createVisit(body: Record<string, any>, refs: { patientId: string; providerId?: string; appointmentId?: string }) {
  const flat = flattenVisitInput(body);
  const digitalSignature = body.digitalSignature;
  const hasFullSig = digitalSignature?.providerName && digitalSignature?.providerId && digitalSignature?.signatureData;

  const visit = await prisma.visit.create({
    data: {
      ...flat,
      patient: { connect: { id: refs.patientId } },
      provider: refs.providerId ? { connect: { id: refs.providerId } } : undefined,
      appointment: refs.appointmentId ? { connect: { id: refs.appointmentId } } : undefined,
      diagnoses: { create: buildDiagnosisCreates(body.diagnoses) },
      treatmentMedications: { create: buildTreatmentMedicationCreates(body.treatmentPlan?.medications) },
      treatmentProcedures: { create: buildTreatmentProcedureCreates(body.treatmentPlan?.procedures) },
      treatmentLifestyle: { create: buildTreatmentLifestyleCreates(body.treatmentPlan?.lifestyle) },
      digitalSignature: hasFullSig
        ? {
            create: {
              providerName: digitalSignature.providerName,
              providerId: digitalSignature.providerId,
              signatureData: digitalSignature.signatureData,
              signedAt: digitalSignature.signedAt ?? new Date(),
              ipAddress: digitalSignature.ipAddress ?? undefined,
            },
          }
        : undefined,
    } as Prisma.VisitCreateInput,
    include: visitInclude,
  });
  return toVisitDTO(visit);
}

/**
 * Update a visit's scalar/flattened fields. digitalSignature, if present in
 * the body, is upserted as part of the same update call (nested write) so
 * the all-or-nothing signature row and the rest of the update commit
 * together. Diagnoses/treatment-plan child arrays are NOT touched here
 * (routes in this batch only ever replace scalar fields + digitalSignature
 * on update, matching the original Mongoose findOneAndUpdate(body) behavior
 * which did not manage nested arrays either).
 */
export async function updateVisit(id: string, body: Record<string, any>) {
  const flat = flattenVisitInput(body);
  const digitalSignature = body.digitalSignature;
  const hasFullSig = digitalSignature?.providerName && digitalSignature?.providerId && digitalSignature?.signatureData;

  const visit = await prisma.visit.update({
    where: { id },
    data: {
      ...flat,
      digitalSignature: hasFullSig
        ? {
            upsert: {
              create: {
                providerName: digitalSignature.providerName,
                providerId: digitalSignature.providerId,
                signatureData: digitalSignature.signatureData,
                signedAt: digitalSignature.signedAt ?? new Date(),
                ipAddress: digitalSignature.ipAddress ?? undefined,
              },
              update: {
                providerName: digitalSignature.providerName,
                providerId: digitalSignature.providerId,
                signatureData: digitalSignature.signatureData,
                signedAt: digitalSignature.signedAt ?? new Date(),
                ipAddress: digitalSignature.ipAddress ?? undefined,
              },
            },
          }
        : undefined,
    } as Prisma.VisitUpdateInput,
    include: visitInclude,
  });
  return toVisitDTO(visit);
}

export async function deleteVisit(id: string) {
  return prisma.visit.delete({ where: { id } });
}

/** Highest existing `VISIT-######` code number, for auto-generation (tenant-scoped by the active context). */
export async function getMaxVisitCodeNumber(): Promise<number> {
  const last = await prisma.visit.findFirst({
    orderBy: { visitCode: 'desc' },
    select: { visitCode: true },
  });
  if (!last?.visitCode) return 0;
  const match = last.visitCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function addVisitAttachment(
  visitId: string,
  attachment: { filename: string; contentType?: string; size?: number; url?: string; uploadedById?: string; notes?: string }
) {
  const visit = await prisma.visit.update({
    where: { id: visitId },
    data: { attachments: { create: attachment } },
    include: visitInclude,
  });
  return toVisitDTO(visit);
}

// ── Automation support (lib/automations/*) ───────────────────────────────────

/** Distinct patient ids with a visit dated on/after `since` (patient re-engagement / health reminders). */
export async function distinctPatientIdsWithVisitSince(since: Date): Promise<string[]> {
  const rows = await prisma.visit.findMany({
    where: { date: { gte: since } },
    select: { patientId: true },
    distinct: ['patientId'],
  });
  return rows.map((r) => r.patientId);
}

/** Distinct patient ids with any visit at all (used to distinguish "inactive" from "never visited"). */
export async function distinctPatientIdsWithAnyVisit(): Promise<string[]> {
  const rows = await prisma.visit.findMany({
    select: { patientId: true },
    distinct: ['patientId'],
  });
  return rows.map((r) => r.patientId);
}

/** Most recent closed checkup visit per patient, for a given id set (health reminders' "last check-up" lookup). */
export async function findMostRecentClosedCheckups(patientIds: string[]): Promise<Map<string, Date>> {
  if (patientIds.length === 0) return new Map();
  const visits = await prisma.visit.findMany({
    where: { patientId: { in: patientIds }, status: 'closed', visitType: 'checkup' },
    orderBy: { date: 'desc' },
    select: { patientId: true, date: true },
  });
  const map = new Map<string, Date>();
  for (const v of visits) {
    if (!map.has(v.patientId)) map.set(v.patientId, v.date);
  }
  return map;
}

/** Visits closed within [from, to] that have not yet had feedback requested (feedback-collection cron). */
export function findVisitsNeedingFeedbackRequest(from: Date, to: Date) {
  return prisma.visit.findMany({
    where: {
      status: 'closed',
      date: { gte: from, lte: to },
      feedbackRequested: { not: true },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    },
  });
}

export async function setVisitFeedbackToken(id: string, token: string) {
  return prisma.visit.update({ where: { id }, data: { feedbackToken: token, feedbackRequested: true } });
}

export function findVisitsNeedingFollowUpReminders(startDate: Date, endDate: Date) {
  return prisma.visit.findMany({
    where: {
      followUpDate: { gte: startDate, lte: endDate },
      followUpReminderSent: { not: true },
      status: { not: 'cancelled' },
    },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true, phone: true } },
      provider: { select: { name: true, email: true } },
    },
  });
}

export async function markFollowUpReminderSent(id: string) {
  return prisma.visit.update({ where: { id }, data: { followUpReminderSent: true } });
}
