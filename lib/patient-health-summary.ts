import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Prescription from '@/models/Prescription';
import Tenant from '@/models/Tenant';
import '@/models/User';

/**
 * A patient's health summary across every clinic they are registered at: allergies, conditions,
 * current and recent medicines and vaccinations, each tagged with the clinic that recorded it.
 * Built from the person's linked records (one per clinic), so it is the record a patient carries
 * from one clinic to the next. The same data feeds the app screen and the PDF.
 */

/** A medicine counts as current this long after issue when the prescription gives no duration. */
export const CURRENT_WITHOUT_DURATION_DAYS = 30;
/** How far back "recent medicines" reaches. */
export const RECENT_MEDICATION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SummaryAllergy = { substance: string; reaction: string | null; severity: string | null; clinics: string[] };
export type SummaryCondition = {
  condition: string;
  status: 'active' | 'resolved' | 'chronic';
  diagnosisDate: string | null;
  notes: string | null;
  clinics: string[];
};
export type SummaryImmunization = { name: string; date: string; batch: string | null; notes: string | null; clinic: string | null };
export type SummaryMedication = {
  name: string;
  genericName: string | null;
  strength: string | null;
  dose: string | null;
  frequency: string | null;
  route: string | null;
  durationDays: number | null;
  instructions: string | null;
  issuedAt: string;
  /** Last day of the course, when the prescription gives a duration. */
  endsAt: string | null;
  prescriptionId: string;
  prescriber: string | null;
  clinic: string | null;
};

export type HealthSummary = {
  generatedAt: string;
  patient: {
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    dateOfBirth: string | null;
    sex: string | null;
  };
  clinics: { tenantId: string; name: string; patientCode: string | null }[];
  allergies: SummaryAllergy[];
  conditions: SummaryCondition[];
  medications: { current: SummaryMedication[]; recent: SummaryMedication[] };
  immunizations: SummaryImmunization[];
};

// ── Pure merging (exported for tests) ────────────────────────────────────────

type RawAllergy = string | { substance?: string; reaction?: string; severity?: string } | null | undefined;
type Tagged<T> = { value: T; clinic: string | null };

const dayOf = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const clean = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

function addClinic(list: string[], clinic: string | null) {
  if (clinic && !list.includes(clinic)) list.push(clinic);
}

/** One entry per substance (case-insensitive); the most detailed record wins, clinics accumulate. */
export function mergeAllergies(items: Tagged<RawAllergy>[]): SummaryAllergy[] {
  const bySubstance = new Map<string, SummaryAllergy>();
  for (const { value, clinic } of items) {
    const substance = clean(typeof value === 'string' ? value : value?.substance);
    if (!substance) continue;
    const reaction = typeof value === 'string' ? null : clean(value?.reaction);
    const severity = typeof value === 'string' ? null : clean(value?.severity);
    const key = substance.toLowerCase();
    const existing = bySubstance.get(key);
    if (existing) {
      existing.reaction ??= reaction;
      existing.severity ??= severity;
      addClinic(existing.clinics, clinic);
    } else {
      bySubstance.set(key, { substance, reaction, severity, clinics: clinic ? [clinic] : [] });
    }
  }
  return [...bySubstance.values()].sort((a, b) => a.substance.localeCompare(b.substance));
}

type RawCondition = { condition?: string; status?: string; diagnosisDate?: unknown; notes?: string };
const CONDITION_RANK: Record<string, number> = { active: 3, chronic: 2, resolved: 1 };

/** One entry per condition; an active or chronic record outranks a resolved one. Open conditions first. */
export function mergeConditions(items: Tagged<RawCondition>[]): SummaryCondition[] {
  const byName = new Map<string, SummaryCondition>();
  for (const { value, clinic } of items) {
    const condition = clean(value?.condition);
    if (!condition) continue;
    const status = (['active', 'resolved', 'chronic'].includes(String(value.status)) ? value.status : 'active') as SummaryCondition['status'];
    const key = condition.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      if ((CONDITION_RANK[status] ?? 0) > (CONDITION_RANK[existing.status] ?? 0)) existing.status = status;
      existing.diagnosisDate ??= dayOf(value.diagnosisDate);
      existing.notes ??= clean(value.notes);
      addClinic(existing.clinics, clinic);
    } else {
      byName.set(key, {
        condition,
        status,
        diagnosisDate: dayOf(value.diagnosisDate),
        notes: clean(value.notes),
        clinics: clinic ? [clinic] : [],
      });
    }
  }
  return [...byName.values()].sort(
    (a, b) => (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0) || a.condition.localeCompare(b.condition)
  );
}

type RawImmunization = { name?: string; date?: unknown; batch?: string; notes?: string };

/** Vaccinations newest first; the same vaccine on the same day at two clinics is one dose. */
export function mergeImmunizations(items: Tagged<RawImmunization>[]): SummaryImmunization[] {
  const seen = new Map<string, SummaryImmunization>();
  for (const { value, clinic } of items) {
    const name = clean(value?.name);
    const date = dayOf(value?.date);
    if (!name || !date) continue;
    const key = `${name.toLowerCase()}|${date}`;
    if (!seen.has(key)) seen.set(key, { name, date, batch: clean(value.batch), notes: clean(value.notes), clinic });
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

type RawPrescription = {
  _id: unknown;
  issuedAt?: unknown;
  status?: string;
  tenantId?: unknown;
  prescribedBy?: { name?: string } | null;
  medications?: Array<{
    name?: string;
    genericName?: string;
    strength?: string;
    dose?: string;
    frequency?: string;
    route?: string;
    durationDays?: number;
    instructions?: string;
  }>;
};

const OPEN_PRESCRIPTION = new Set(['active', 'dispensed', 'partially-dispensed']);

/**
 * Current vs recent medicines. Current: on a prescription that is still open and whose course
 * hasn't ended (issue date + duration; CURRENT_WITHOUT_DURATION_DAYS when no duration). Each
 * medicine appears once per list, from its latest prescription.
 */
export function splitMedications(
  prescriptions: RawPrescription[],
  clinicName: (tenantId: unknown) => string | null,
  now = new Date()
): { current: SummaryMedication[]; recent: SummaryMedication[] } {
  const current = new Map<string, SummaryMedication>();
  const recent = new Map<string, SummaryMedication>();
  const sorted = [...prescriptions].sort((a, b) => new Date(String(b.issuedAt)).getTime() - new Date(String(a.issuedAt)).getTime());

  for (const rx of sorted) {
    const issued = new Date(String(rx.issuedAt));
    if (isNaN(issued.getTime()) || rx.status === 'cancelled') continue;
    for (const med of rx.medications ?? []) {
      const name = clean(med.name);
      if (!name) continue;
      const duration = typeof med.durationDays === 'number' && med.durationDays > 0 ? med.durationDays : null;
      const end = new Date(issued.getTime() + (duration ?? CURRENT_WITHOUT_DURATION_DAYS) * DAY_MS);
      const isCurrent = OPEN_PRESCRIPTION.has(String(rx.status)) && end >= now;
      const key = name.toLowerCase();
      const target = isCurrent ? current : recent;
      if (target.has(key) || (!isCurrent && current.has(key))) continue;
      target.set(key, {
        name,
        genericName: clean(med.genericName),
        strength: clean(med.strength),
        dose: clean(med.dose),
        frequency: clean(med.frequency),
        route: clean(med.route),
        durationDays: duration,
        instructions: clean(med.instructions),
        issuedAt: issued.toISOString(),
        endsAt: duration ? dayOf(end) : null,
        prescriptionId: String(rx._id),
        prescriber: clean(rx.prescribedBy?.name),
        clinic: clinicName(rx.tenantId),
      });
    }
  }
  return { current: [...current.values()], recent: [...recent.values()].filter((m) => !current.has(m.name.toLowerCase())) };
}

// ── Loading ──────────────────────────────────────────────────────────────────

type SummaryRecord = {
  _id: Types.ObjectId;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth?: Date;
  sex?: string;
  patientCode?: string;
  tenantIds?: Types.ObjectId[];
  allergies?: RawAllergy[];
  preExistingConditions?: RawCondition[];
  immunizations?: RawImmunization[];
};

/**
 * Build the summary for `patientId` (shown as the person) from `patientIds` (all their linked
 * records), limited to the clinics in `scope` (null = every clinic of those records).
 */
export async function buildHealthSummary(options: {
  patientId: unknown;
  patientIds: Types.ObjectId[];
  scope: unknown[] | null;
  now?: Date;
}): Promise<HealthSummary | null> {
  const now = options.now ?? new Date();
  await connectDB();

  const records = await Patient.find({ _id: { $in: options.patientIds }, active: { $ne: false } })
    .select('firstName middleName lastName suffix dateOfBirth sex patientCode tenantIds allergies preExistingConditions immunizations')
    .lean<SummaryRecord[]>();
  const self = records.find((r) => String(r._id) === String(options.patientId)) ?? records[0];
  if (!self) return null;

  const scopeKeys = options.scope ? new Set(options.scope.map(String)) : null;
  const inScope = (tenantId: unknown) => !scopeKeys || scopeKeys.has(String(tenantId));
  const recordClinics = (r: SummaryRecord) => (r.tenantIds ?? []).filter(inScope);
  const visible = records.filter((r) => recordClinics(r).length > 0 || (!scopeKeys && !(r.tenantIds ?? []).length));

  const tenantIds = [...new Set(visible.flatMap(recordClinics).map(String))];
  const tenants = tenantIds.length
    ? await Tenant.find({ _id: { $in: tenantIds.map((id) => new Types.ObjectId(id)) } })
        .select('name displayName')
        .lean<{ _id: Types.ObjectId; name?: string; displayName?: string }[]>()
    : [];
  const nameOf = new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || 'Clinic']));
  const clinicName = (tenantId: unknown) => (tenantId ? nameOf.get(String(tenantId)) ?? null : null);
  // A record usually belongs to one clinic; name it by its first clinic in scope.
  const recordClinic = (r: SummaryRecord) => clinicName(recordClinics(r)[0]);

  const prescriptions = await Prescription.find({
    patient: { $in: visible.map((r) => r._id) },
    ...(scopeKeys ? { tenantId: { $in: options.scope } } : {}),
    status: { $ne: 'cancelled' },
    issuedAt: { $gte: new Date(now.getTime() - RECENT_MEDICATION_DAYS * DAY_MS) },
  })
    .select('issuedAt status tenantId medications prescribedBy')
    .populate({ path: 'prescribedBy', select: 'name' })
    .sort({ issuedAt: -1 })
    .limit(200)
    .lean<RawPrescription[]>();

  return {
    generatedAt: now.toISOString(),
    patient: {
      firstName: self.firstName,
      middleName: self.middleName ?? null,
      lastName: self.lastName,
      suffix: self.suffix ?? null,
      dateOfBirth: dayOf(self.dateOfBirth),
      sex: self.sex ?? null,
    },
    clinics: tenantIds.map((id) => ({
      tenantId: id,
      name: nameOf.get(id) ?? 'Clinic',
      patientCode: visible.find((r) => (r.tenantIds ?? []).some((t) => String(t) === id))?.patientCode ?? null,
    })),
    allergies: mergeAllergies(visible.flatMap((r) => (r.allergies ?? []).map((value) => ({ value, clinic: recordClinic(r) })))),
    conditions: mergeConditions(
      visible.flatMap((r) => (r.preExistingConditions ?? []).map((value) => ({ value, clinic: recordClinic(r) })))
    ),
    medications: splitMedications(prescriptions, clinicName, now),
    immunizations: mergeImmunizations(
      visible.flatMap((r) => (r.immunizations ?? []).map((value) => ({ value, clinic: recordClinic(r) })))
    ),
  };
}
