/**
 * Data-access layer for the Prescription model (Phase 5 Batch 4 — clinical
 * core). Prescription carries a direct `tenantId` column
 * (DIRECTLY_SCOPED_MODELS in lib/prisma-tenant-extension.ts) — standard
 * runWithTenant(tenantId, fn) scoping applies.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller. Functions here do not open their own context.
 *
 * Multi-table writes: medications / pharmacyDispenses / patientCopy /
 * clinicCopy / drugInteractions are all separate child tables (see
 * prisma/MIGRATION_NOTES.md's "Prescription" section). createPrescription()
 * uses Prisma's nested-write API (`data: { medications: { create: [...] },
 * ... }`) inside a single `prisma.prescription.create()` call rather than a
 * manual `$transaction([...])` — Prisma wraps one create-with-nested-writes
 * call in an implicit transaction automatically, so this is already atomic
 * without extra ceremony (per the approved plan's preference for nested
 * writes over manual $transaction where possible). recordPharmacyDispense()
 * similarly does an update with a nested `pharmacyDispenses: { create }`
 * plus a `status` field in the SAME update call, so the dispense-record
 * insert and the status transition commit together atomically.
 *
 * Field mapping mirrors scripts/migrate-to-postgres/migrate.ts's
 * migratePrescriptions(). toPrescriptionDTO() re-nests `copies.patientCopy`
 * / `copies.clinicCopy` and `digitalSignature` under their Mongoose-era
 * keys for frontend/print-template compatibility.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export const prescriptionInclude = {
  patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, email: true, phone: true, dateOfBirth: true, addressStreet: true, addressCity: true, addressState: true, addressZipCode: true, sex: true } },
  prescribedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      doctorProfile: { select: { licenseNumber: true } },
    },
  },
  visit: { select: { id: true, visitCode: true, date: true, followUpDate: true } },
  medications: { include: { medicine: { select: { id: true, name: true, genericName: true, form: true, strength: true } } } },
  pharmacyDispenses: true,
  patientCopy: { include: { printedBy: { select: { id: true, name: true, email: true } } } },
  clinicCopy: { include: { archivedBy: { select: { id: true, name: true, email: true } } } },
  drugInteractions: true,
} satisfies Prisma.PrescriptionInclude;

type PrescriptionWithRelations = Prisma.PrescriptionGetPayload<{ include: typeof prescriptionInclude }>;

export function toPrescriptionDTO(prescription: PrescriptionWithRelations) {
  const {
    id,
    patientCopy,
    clinicCopy,
    digitalSignatureProviderName,
    digitalSignatureData,
    digitalSignatureSignedAt,
    ...rest
  } = prescription;

  const hasSignature = Boolean(digitalSignatureProviderName && digitalSignatureData);

  return {
    _id: id,
    id,
    ...rest,
    copies: {
      patientCopy: patientCopy ?? undefined,
      clinicCopy: clinicCopy ?? undefined,
    },
    digitalSignature: hasSignature
      ? {
          providerName: digitalSignatureProviderName,
          signatureData: digitalSignatureData,
          signedAt: digitalSignatureSignedAt,
        }
      : undefined,
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. Relation arrays/1:1 children are handled separately by the caller. */
export function flattenPrescriptionInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };

  const digitalSignature = body.digitalSignature;
  if (digitalSignature) {
    flat.digitalSignatureProviderName = digitalSignature.providerName ?? undefined;
    flat.digitalSignatureData = digitalSignature.signatureData ?? undefined;
    flat.digitalSignatureSignedAt = digitalSignature.signedAt ?? new Date();
  }
  delete flat.digitalSignature;

  delete flat.copies;
  delete flat.medications;
  delete flat.pharmacyDispenses;
  delete flat.drugInteractions;
  delete flat.patient;
  delete flat.prescribedBy;
  delete flat.visit;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;

  return flat;
}

function buildMedicationCreates(medications: any[] | undefined): Prisma.PrescriptionMedicationCreateWithoutPrescriptionInput[] {
  if (!Array.isArray(medications)) return [];
  return medications.map((m) => ({
    medicineId: m.medicineId || undefined,
    name: m.name,
    genericName: m.genericName ?? undefined,
    form: m.form ?? undefined,
    strength: m.strength ?? undefined,
    dose: m.dose ?? undefined,
    route: m.route ?? undefined,
    frequency: m.frequency ?? undefined,
    durationDays: m.durationDays ?? undefined,
    quantity: m.quantity ?? undefined,
    instructions: m.instructions ?? undefined,
    calcDose: m.calculatedDosage?.dose ?? undefined,
    calcFrequency: m.calculatedDosage?.frequency ?? undefined,
    calcTotalDailyDose: m.calculatedDosage?.totalDailyDose ?? undefined,
    calcInstructions: m.calculatedDosage?.instructions ?? undefined,
  }));
}

function buildDrugInteractionCreates(interactions: any[] | undefined): Prisma.PrescriptionDrugInteractionCreateWithoutPrescriptionInput[] {
  if (!Array.isArray(interactions)) return [];
  return interactions.map((d) => ({
    medication1: d.medication1,
    medication2: d.medication2,
    severity: d.severity,
    description: d.description,
    recommendation: d.recommendation ?? undefined,
    checkedAt: d.checkedAt ? new Date(d.checkedAt) : new Date(),
  }));
}

export interface PrescriptionFilter {
  patientId?: string;
  visitId?: string;
  status?: string;
}

export function buildPrescriptionWhere(filter: PrescriptionFilter): Prisma.PrescriptionWhereInput {
  const where: Prisma.PrescriptionWhereInput = {};
  if (filter.patientId) where.patientId = filter.patientId;
  if (filter.visitId) where.visitId = filter.visitId;
  if (filter.status) where.status = filter.status as Prisma.PrescriptionWhereInput['status'];
  return where;
}

export async function listPrescriptions(where: Prisma.PrescriptionWhereInput) {
  const prescriptions = await prisma.prescription.findMany({
    where,
    include: prescriptionInclude,
    orderBy: { issuedAt: 'desc' },
  });
  return prescriptions.map(toPrescriptionDTO);
}

export async function getPrescriptionById(id: string) {
  const prescription = await prisma.prescription.findUnique({ where: { id }, include: prescriptionInclude });
  return prescription ? toPrescriptionDTO(prescription) : null;
}

export function findPrescriptionRawById(id: string) {
  return prisma.prescription.findUnique({ where: { id } });
}

/**
 * Create a prescription with all of its child relations in one atomic
 * nested-write call: medications, pharmacyDispenses, patientCopy,
 * clinicCopy, drugInteractions.
 */
export async function createPrescription(
  body: Record<string, any>,
  refs: { patientId: string; visitId?: string; prescribedById?: string }
) {
  const flat = flattenPrescriptionInput(body);
  const patientCopy = body.copies?.patientCopy;
  const clinicCopy = body.copies?.clinicCopy;

  const prescription = await prisma.prescription.create({
    data: {
      ...flat,
      patient: { connect: { id: refs.patientId } },
      visit: refs.visitId ? { connect: { id: refs.visitId } } : undefined,
      prescribedBy: refs.prescribedById ? { connect: { id: refs.prescribedById } } : undefined,
      medications: { create: buildMedicationCreates(body.medications) },
      pharmacyDispenses: { create: [] },
      patientCopy: patientCopy
        ? { create: { printedAt: patientCopy.printedAt ?? undefined, printedById: patientCopy.printedBy || undefined, digitalCopySent: patientCopy.digitalCopySent ?? false, sentAt: patientCopy.sentAt ?? undefined } }
        : undefined,
      clinicCopy: clinicCopy
        ? { create: { archivedAt: clinicCopy.archivedAt ?? undefined, archivedById: clinicCopy.archivedBy || undefined, location: clinicCopy.location ?? undefined } }
        : undefined,
      drugInteractions: { create: buildDrugInteractionCreates(body.drugInteractions) },
    } as Prisma.PrescriptionCreateInput,
    include: prescriptionInclude,
  });
  return toPrescriptionDTO(prescription);
}

/** Update a prescription's scalar/flattened fields. Does not touch medications/pharmacyDispenses/copies/drugInteractions relation arrays. */
export async function updatePrescription(id: string, body: Record<string, any>) {
  const flat = flattenPrescriptionInput(body);
  const prescription = await prisma.prescription.update({
    where: { id },
    data: flat as Prisma.PrescriptionUpdateInput,
    include: prescriptionInclude,
  });
  return toPrescriptionDTO(prescription);
}

export async function deletePrescription(id: string) {
  return prisma.prescription.delete({ where: { id } });
}

/**
 * Replace a prescription's medications child rows in one atomic nested-write
 * update call (deleteMany + createMany), used by
 * lib/automations/prescription-from-visit.ts when the source visit's
 * treatmentPlan.medications changes after the prescription already exists.
 */
export async function replacePrescriptionMedications(id: string, medications: any[]) {
  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      updatedAt: new Date(),
      medications: {
        deleteMany: {},
        create: buildMedicationCreates(medications),
      },
    },
    include: prescriptionInclude,
  });
  return toPrescriptionDTO(prescription);
}

/** Highest existing `RX-######` code number, for auto-generation (tenant-scoped by the active context). */
export async function getMaxPrescriptionCodeNumber(): Promise<number> {
  const last = await prisma.prescription.findFirst({
    orderBy: { prescriptionCode: 'desc' },
    select: { prescriptionCode: true },
  });
  if (!last?.prescriptionCode) return 0;
  const match = last.prescriptionCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function listActivePrescriptionsForPatient(patientId: string) {
  return prisma.prescription.findMany({
    where: { patientId, status: { in: ['active', 'partially_dispensed'] } },
    include: { medications: true },
  });
}

/**
 * Record a pharmacy dispense event and update status in one atomic update
 * call (nested `pharmacyDispenses: { create }` + `status` in the same
 * `prisma.prescription.update()`), so the dispense insert and the status
 * transition commit together.
 */
export async function recordPharmacyDispense(
  id: string,
  dispense: {
    pharmacyId?: string;
    pharmacyName?: string;
    dispensedBy?: string;
    quantityDispensed?: number;
    notes?: string;
    trackingNumber?: string;
  }
) {
  const existing = await prisma.prescription.findUniqueOrThrow({
    where: { id },
    include: { medications: true, pharmacyDispenses: true },
  });

  const totalDispensedSoFar = existing.pharmacyDispenses.reduce((sum, d) => sum + (d.quantityDispensed ?? 0), 0);
  const totalDispensed = totalDispensedSoFar + (dispense.quantityDispensed ?? 0);
  const totalPrescribed = existing.medications.reduce((sum, m) => sum + (m.quantity ?? 0), 0);

  let status: Prisma.PrescriptionUpdateInput['status'] = existing.status;
  if (totalDispensed >= totalPrescribed && totalPrescribed > 0) {
    status = 'dispensed';
  } else if (totalDispensed > 0) {
    status = 'partially_dispensed';
  }

  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      status,
      pharmacyDispenses: {
        create: {
          pharmacyId: dispense.pharmacyId ?? undefined,
          pharmacyName: dispense.pharmacyName ?? undefined,
          dispensedAt: new Date(),
          dispensedBy: dispense.dispensedBy ?? 'Pharmacy Staff',
          quantityDispensed: dispense.quantityDispensed ?? undefined,
          notes: dispense.notes ?? undefined,
          trackingNumber: dispense.trackingNumber ?? undefined,
        },
      },
    },
    include: prescriptionInclude,
  });
  return toPrescriptionDTO(prescription);
}

// ── Automation / reporting support (lib/automations/*) ───────────────────────

export function countPrescriptionsInRange(start: Date, end: Date) {
  return prisma.prescription.count({ where: { issuedAt: { gte: start, lte: end } } });
}

export function listPrescriptionsForDoctorInRange(prescribedById: string, start: Date, end: Date) {
  return prisma.prescription.findMany({ where: { prescribedById, issuedAt: { gte: start, lte: end } } });
}

export async function markPatientCopyPrinted(id: string, printedById: string) {
  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      patientCopy: {
        upsert: {
          create: { printedAt: new Date(), printedById },
          update: { printedAt: new Date(), printedById },
        },
      },
    },
    include: prescriptionInclude,
  });
  return toPrescriptionDTO(prescription);
}

export async function markClinicCopyArchived(id: string, archivedById: string, location = 'Digital Archive') {
  const prescription = await prisma.prescription.update({
    where: { id },
    data: {
      clinicCopy: {
        upsert: {
          create: { archivedAt: new Date(), archivedById, location },
          update: { archivedAt: new Date(), archivedById, location },
        },
      },
    },
    include: prescriptionInclude,
  });
  return toPrescriptionDTO(prescription);
}
