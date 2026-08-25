/**
 * Data-access layer for the Patient model — the special-case model of Phase 5
 * Batch 3. Patient is scoped via the many-to-many `PatientTenant` junction
 * table (JUNCTION_SCOPED_MODELS.Patient = 'tenants' in
 * lib/prisma-tenant-extension.ts), NOT a direct tenantId column, because a
 * patient can legitimately belong to more than one tenant/clinic branch.
 *
 * Every function below assumes an active tenant context has already been
 * established by the caller via runWithTenant(tenantId, fn) for routes that
 * must stay inside one tenant's patient roster, or runAsSystem(fn) for
 * genuinely cross-tenant lookups (patient-portal login by code/phone/email
 * before a session exists, /api/patients/lookup, /api/patients/public).
 * Functions here do not open their own context.
 *
 * Shape: the pre-migration Mongoose `Patient` model exposed a nested JSON
 * shape (address, contacts, emergencyContact, identifiers, socialHistory,
 * discountEligibility, segmentFlags) while Prisma's Patient row is flattened
 * (see prisma/schema.prisma comments + prisma/MIGRATION_NOTES.md). Routes and
 * the frontend still expect the nested shape, so this module translates:
 *   - toPatientDTO()      Prisma row (+ relations) -> nested API shape
 *   - flattenPatientInput() nested API input -> flat Prisma create/update data
 *
 * Sensitive-field exclusion: `password` and `otp` were Mongoose `select:
 * false` fields. Prisma has no field-level default-exclusion, so this module
 * is the enforcement point via Prisma 7's `omit` API, mirroring
 * lib/data/user.ts. `getPatientByIdWithAuthFields` /
 * `findPatientAcrossTenantsWithAuthFields` are the ONLY functions that
 * include password/otp — reserved for the patient-portal auth routes that
 * legitimately need to verify credentials. Never expose their result outside
 * those routes without stripping password/otp first.
 */
import prisma from '../prisma';
import { Prisma } from '@prisma/client';

const omitSensitive = { password: true, otp: true } satisfies Prisma.PatientOmit;

const fullInclude = {
  tenants: true,
  preExistingConditions: true,
  allergies: true,
  immunizations: true,
  attachments: true,
} satisfies Prisma.PatientInclude;

type PatientWithRelations = Prisma.PatientGetPayload<{ include: typeof fullInclude }>;

/** Nested API-facing shape, matching the pre-migration Mongoose IPatient contract. */
export function toPatientDTO(patient: PatientWithRelations & { password?: string | null; otp?: string | null }) {
  const {
    id,
    tenants,
    preExistingConditions,
    allergies,
    immunizations,
    attachments,
    contactsPhone,
    contactsEmail,
    contactsAddress,
    addressStreet,
    addressCity,
    addressState,
    addressZipCode,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
    emergencyContactRelation,
    identifierPhilHealth,
    identifierGovId,
    identifierOther,
    socialHistorySmoker,
    socialHistoryAlcohol,
    socialHistoryDrugs,
    socialHistoryNotes,
    familyHistory,
    pwdEligible,
    pwdIdNumber,
    pwdExpiryDate,
    seniorEligible,
    seniorIdNumber,
    membershipDiscEligible,
    membershipDiscType,
    membershipDiscNumber,
    membershipDiscExpiryDate,
    membershipDiscPercentage,
    segFlagIsVIP,
    segFlagIsHighRisk,
    segFlagIsHighUtilizer,
    segFlagHasRecurringNoShow,
    segFlagIsPendingVerification,
    segFlagHasOutstandingBalance,
    password,
    otp,
    ...rest
  } = patient;

  return {
    _id: id,
    id,
    tenantIds: tenants.map((t) => t.tenantId),
    ...rest,
    contacts: { phone: contactsPhone, email: contactsEmail, address: contactsAddress },
    address: { street: addressStreet, city: addressCity, state: addressState, zipCode: addressZipCode },
    emergencyContact: {
      name: emergencyContactName,
      phone: emergencyContactPhone,
      relationship: emergencyContactRelationship,
      relation: emergencyContactRelation,
    },
    identifiers: {
      philHealth: identifierPhilHealth,
      govId: identifierGovId,
      other: identifierOther ?? undefined,
    },
    preExistingConditions,
    allergies: allergies.map((a) => (a.rawText != null ? a.rawText : { substance: a.substance, reaction: a.reaction, severity: a.severity })),
    immunizations,
    socialHistory: {
      smoker: socialHistorySmoker,
      alcohol: socialHistoryAlcohol,
      drugs: socialHistoryDrugs,
      notes: socialHistoryNotes,
    },
    familyHistory: familyHistory ?? undefined,
    discountEligibility: {
      pwd: { eligible: pwdEligible, idNumber: pwdIdNumber, expiryDate: pwdExpiryDate },
      senior: { eligible: seniorEligible, idNumber: seniorIdNumber },
      membership: {
        eligible: membershipDiscEligible,
        membershipType: membershipDiscType,
        membershipNumber: membershipDiscNumber,
        expiryDate: membershipDiscExpiryDate,
        discountPercentage: membershipDiscPercentage,
      },
    },
    segmentFlags: {
      isVIP: segFlagIsVIP,
      isHighRisk: segFlagIsHighRisk,
      isHighUtilizer: segFlagIsHighUtilizer,
      hasRecurringNoShow: segFlagHasRecurringNoShow,
      isPendingVerification: segFlagIsPendingVerification,
      hasOutstandingBalance: segFlagHasOutstandingBalance,
    },
    attachments,
  };
}

/** Flatten nested API input (create or update body) into Prisma scalar columns. Does NOT touch relation arrays — see buildJunctionCreates/buildChildCreates. */
export function flattenPatientInput(body: Record<string, any>): Record<string, any> {
  const flat: Record<string, any> = { ...body };

  const contacts = body.contacts ?? {};
  flat.contactsPhone = contacts.phone ?? undefined;
  flat.contactsEmail = contacts.email ?? undefined;
  flat.contactsAddress = contacts.address ?? undefined;
  delete flat.contacts;

  const address = body.address ?? {};
  if (body.address) {
    flat.addressStreet = address.street;
    flat.addressCity = address.city;
    flat.addressState = address.state;
    flat.addressZipCode = address.zipCode;
  }
  delete flat.address;

  const ec = body.emergencyContact;
  if (ec) {
    flat.emergencyContactName = ec.name ?? undefined;
    flat.emergencyContactPhone = ec.phone ?? undefined;
    flat.emergencyContactRelationship = ec.relationship ?? undefined;
    flat.emergencyContactRelation = ec.relation ?? undefined;
  }
  delete flat.emergencyContact;

  const identifiers = body.identifiers;
  if (identifiers) {
    flat.identifierPhilHealth = identifiers.philHealth ?? undefined;
    flat.identifierGovId = identifiers.govId ?? undefined;
    flat.identifierOther = identifiers.other ?? undefined;
  }
  delete flat.identifiers;

  const socialHistory = body.socialHistory;
  if (socialHistory) {
    flat.socialHistorySmoker = socialHistory.smoker ?? undefined;
    flat.socialHistoryAlcohol = socialHistory.alcohol ?? undefined;
    flat.socialHistoryDrugs = socialHistory.drugs ?? undefined;
    flat.socialHistoryNotes = socialHistory.notes ?? undefined;
  }
  delete flat.socialHistory;

  const discountEligibility = body.discountEligibility;
  if (discountEligibility) {
    const { pwd, senior, membership } = discountEligibility;
    if (pwd) {
      flat.pwdEligible = pwd.eligible ?? undefined;
      flat.pwdIdNumber = pwd.idNumber ?? undefined;
      flat.pwdExpiryDate = pwd.expiryDate ?? undefined;
    }
    if (senior) {
      flat.seniorEligible = senior.eligible ?? undefined;
      flat.seniorIdNumber = senior.idNumber ?? undefined;
    }
    if (membership) {
      flat.membershipDiscEligible = membership.eligible ?? undefined;
      flat.membershipDiscType = membership.membershipType ?? undefined;
      flat.membershipDiscNumber = membership.membershipNumber ?? undefined;
      flat.membershipDiscExpiryDate = membership.expiryDate ?? undefined;
      flat.membershipDiscPercentage = membership.discountPercentage ?? undefined;
    }
  }
  delete flat.discountEligibility;

  const segmentFlags = body.segmentFlags;
  if (segmentFlags) {
    flat.segFlagIsVIP = segmentFlags.isVIP ?? undefined;
    flat.segFlagIsHighRisk = segmentFlags.isHighRisk ?? undefined;
    flat.segFlagIsHighUtilizer = segmentFlags.isHighUtilizer ?? undefined;
    flat.segFlagHasRecurringNoShow = segmentFlags.hasRecurringNoShow ?? undefined;
    flat.segFlagIsPendingVerification = segmentFlags.isPendingVerification ?? undefined;
    flat.segFlagHasOutstandingBalance = segmentFlags.hasOutstandingBalance ?? undefined;
  }
  delete flat.segmentFlags;

  // Relation-backed fields are handled separately by the caller (create/update).
  delete flat.preExistingConditions;
  delete flat.allergies;
  delete flat.immunizations;
  delete flat.attachments;
  delete flat.tenantIds;
  delete flat.tenantId;
  delete flat.id;
  delete flat._id;
  delete flat.createdAt;
  delete flat.updatedAt;

  return flat;
}

function buildAllergyCreates(allergies: any[] | undefined): Prisma.PatientAllergyCreateWithoutPatientInput[] {
  if (!Array.isArray(allergies)) return [];
  return allergies.map((a) =>
    typeof a === 'string'
      ? { rawText: a }
      : { substance: a?.substance ?? undefined, reaction: a?.reaction ?? undefined, severity: a?.severity ?? undefined }
  );
}

function buildConditionCreates(conditions: any[] | undefined): Prisma.PatientPreExistingConditionCreateWithoutPatientInput[] {
  if (!Array.isArray(conditions)) return [];
  return conditions.map((c) => ({
    condition: c.condition,
    diagnosisDate: c.diagnosisDate ?? undefined,
    status: c.status ?? 'active',
    notes: c.notes ?? undefined,
  }));
}

function buildImmunizationCreates(immunizations: any[] | undefined): Prisma.PatientImmunizationCreateWithoutPatientInput[] {
  if (!Array.isArray(immunizations)) return [];
  return immunizations.map((i) => ({
    name: i.name,
    date: i.date,
    batch: i.batch ?? undefined,
    notes: i.notes ?? undefined,
  }));
}

export interface GetPatientOptions {
  /** Include the full relation set (allergies, conditions, immunizations, attachments, tenants). Default true. */
  withRelations?: boolean;
}

export async function getPatientById(id: string, opts: GetPatientOptions = {}) {
  const { withRelations = true } = opts;
  const patient = await prisma.patient.findUnique({
    where: { id },
    omit: omitSensitive,
    include: withRelations ? fullInclude : { tenants: true },
  });
  if (!patient) return null;
  return toPatientDTO(patient as PatientWithRelations);
}

/**
 * SENSITIVE / INTERNAL USE ONLY. Includes password + otp fields for
 * credential verification in the patient-portal auth routes. Never expose
 * this result to an API response without stripping password/otp first.
 */
export function getPatientByIdWithAuthFields(id: string) {
  return prisma.patient.findUnique({
    where: { id },
    include: { tenants: true },
  });
}

/**
 * Cross-tenant patient lookup. MUST be called from within runAsSystem() —
 * used by pre-session routes (patient-portal login by code/phone/email,
 * /api/patients/lookup, /api/patients/public) that need to find a patient
 * before any tenant is established. Callers that need to enforce "this
 * patient belongs to tenant X" should check the returned `tenants` array
 * themselves afterward.
 */
export interface FindPatientAcrossTenantsFilter {
  email?: string;
  phone?: string;
  patientCode?: string;
  contactsPhone?: string;
  contactsEmail?: string;
  tenantId?: string;
}

function buildFindWhere(filter: FindPatientAcrossTenantsFilter): Prisma.PatientWhereInput {
  const or: Prisma.PatientWhereInput[] = [];
  if (filter.email) or.push({ email: filter.email }, { contactsEmail: filter.email });
  if (filter.phone) or.push({ phone: filter.phone }, { contactsPhone: filter.phone });
  if (filter.patientCode) or.push({ patientCode: filter.patientCode });

  const where: Prisma.PatientWhereInput = or.length ? { OR: or } : {};
  if (filter.tenantId) {
    where.tenants = { some: { tenantId: filter.tenantId } };
  }
  return where;
}

/** Cross-tenant lookup, non-sensitive fields only. Call within runAsSystem(). */
export async function findPatientAcrossTenants(filter: FindPatientAcrossTenantsFilter) {
  const patient = await prisma.patient.findFirst({
    where: buildFindWhere(filter),
    omit: omitSensitive,
    include: { tenants: true },
  });
  return patient;
}

/**
 * SENSITIVE / INTERNAL USE ONLY. Cross-tenant lookup including password/otp,
 * for the patient-portal auth routes (login, otp/verify, token). Call within
 * runAsSystem(). Never expose the result outside those routes without
 * stripping password/otp first.
 */
export async function findPatientAcrossTenantsWithAuthFields(filter: FindPatientAcrossTenantsFilter) {
  return prisma.patient.findFirst({
    where: buildFindWhere(filter),
    include: { tenants: true },
  });
}

export interface CreatePatientOptions {
  tenantId?: string;
  tenantIds?: string[];
}

/**
 * Create a new patient. `tenantIds`/`tenantId` are supplied explicitly as a
 * nested junction create — Patient is JUNCTION_SCOPED, so
 * lib/prisma-tenant-extension.ts intentionally does NOT auto-stamp tenantId
 * on create (see its comment block). Mirrors
 * scripts/migrate-to-postgres/migrate.ts's migratePatients() pattern.
 */
export async function createPatient(body: Record<string, any>, opts: CreatePatientOptions = {}) {
  const flat = flattenPatientInput(body);
  const tenantIds = opts.tenantIds ?? (opts.tenantId ? [opts.tenantId] : []);

  const patient = await prisma.patient.create({
    data: {
      ...flat,
      tenants: { create: tenantIds.map((tenantId) => ({ tenantId })) },
      preExistingConditions: { create: buildConditionCreates(body.preExistingConditions) },
      allergies: { create: buildAllergyCreates(body.allergies) },
      immunizations: { create: buildImmunizationCreates(body.immunizations) },
    } as Prisma.PatientCreateInput,
    omit: omitSensitive,
    include: fullInclude,
  });
  return toPatientDTO(patient as PatientWithRelations);
}

/**
 * Update a patient's scalar/nested-struct fields. Relation arrays
 * (allergies/preExistingConditions/immunizations/attachments) and the
 * tenants junction are NOT touched here — use addPatientToTenant /
 * removePatientFromTenant for tenant membership, and the notes/upload
 * routes' own data modules for those child collections.
 */
export async function updatePatient(id: string, body: Record<string, any>) {
  const flat = flattenPatientInput(body);
  const patient = await prisma.patient.update({
    where: { id },
    data: flat as Prisma.PatientUpdateInput,
    omit: omitSensitive,
    include: fullInclude,
  });
  return toPatientDTO(patient as PatientWithRelations);
}

export async function deletePatient(id: string) {
  return prisma.patient.delete({ where: { id } });
}

export interface ListPatientsOptions {
  skip?: number;
  take?: number;
  orderBy?: Prisma.PatientOrderByWithRelationInput;
}

export async function listPatients(filter: Prisma.PatientWhereInput | undefined, opts: ListPatientsOptions = {}) {
  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where: filter,
      omit: omitSensitive,
      include: fullInclude,
      orderBy: opts.orderBy ?? { createdAt: 'desc' },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.patient.count({ where: filter }),
  ]);
  return { patients: patients.map((p) => toPatientDTO(p as PatientWithRelations)), total };
}

/** Highest existing `CLINIC-####` patientCode number, for auto-generation. */
export async function getMaxPatientCodeNumber(): Promise<number> {
  const last = await prisma.patient.findFirst({
    where: { patientCode: { startsWith: 'CLINIC-' } },
    orderBy: { patientCode: 'desc' },
    select: { patientCode: true },
  });
  if (!last?.patientCode) return 0;
  const match = last.patientCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function patientCodeExists(patientCode: string): Promise<boolean> {
  const existing = await prisma.patient.findUnique({ where: { patientCode }, select: { id: true } });
  return !!existing;
}

// ── Automation support (lib/automations/*) ───────────────────────────────────

const automationSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  contactsEmail: true,
  contactsPhone: true,
  dateOfBirth: true,
  sex: true,
  active: true,
  createdAt: true,
} satisfies Prisma.PatientSelect;

export type PatientAutomationRow = Prisma.PatientGetPayload<{ select: typeof automationSelect }>;

/**
 * Minimal active-patient projection for lib/automations/* (birthday
 * greetings, health reminders, broadcast messaging, re-engagement). Callers
 * filter/group in memory — mirrors the old Mongoose `Patient.find({...})`
 * calls those modules made directly. Runs inside the caller's
 * runWithTenant/runAsSystem context (tenant scoping applied automatically by
 * the Prisma extension for the junction-scoped Patient model).
 */
export async function listActivePatientsForAutomation(): Promise<PatientAutomationRow[]> {
  return prisma.patient.findMany({
    where: { active: { not: false } },
    select: automationSelect,
  });
}

/** Same projection, restricted to a specific id set (e.g. custom broadcast target list). */
export async function listPatientsByIdsForAutomation(ids: string[]): Promise<PatientAutomationRow[]> {
  if (ids.length === 0) return [];
  return prisma.patient.findMany({
    where: { id: { in: ids }, active: { not: false } },
    select: automationSelect,
  });
}

/**
 * All patient ids (across every tenant) whose `phone`/`contactsPhone` column
 * matches either the raw or whitespace-stripped form of `phone`. Call within
 * runAsSystem() — used by the unauthenticated Twilio inbound-SMS webhook,
 * which has no session-derived tenant to scope by.
 */
export async function findPatientIdsByPhone(phone: string): Promise<string[]> {
  const normalised = phone.replace(/\s+/g, '');
  const patients = await prisma.patient.findMany({
    where: {
      OR: [
        { phone: normalised },
        { phone },
        { contactsPhone: normalised },
        { contactsPhone: phone },
      ],
    },
    select: { id: true },
  });
  return patients.map((p) => p.id);
}

// ── Tenant-membership junction (the [id]/tenants route) ─────────────────────

/** All tenants a patient belongs to (join through PatientTenant). Call within runAsSystem() since it must work regardless of caller's own tenant. */
export async function listPatientTenants(patientId: string) {
  const rows = await prisma.patientTenant.findMany({
    where: { patientId },
    include: { tenant: true },
  });
  return rows.map((r) => r.tenant);
}

export async function addPatientToTenant(patientId: string, tenantId: string) {
  return prisma.patientTenant.upsert({
    where: { patientId_tenantId: { patientId, tenantId } },
    create: { patientId, tenantId },
    update: {},
  });
}

export async function removePatientFromTenant(patientId: string, tenantId: string) {
  return prisma.patientTenant.delete({
    where: { patientId_tenantId: { patientId, tenantId } },
  });
}

// ── Auth field accessors (password/otp) ──────────────────────────────────────

export async function setPatientPassword(id: string, passwordHash: string) {
  return prisma.patient.update({ where: { id }, data: { password: passwordHash }, omit: omitSensitive });
}

export async function setPatientOtp(id: string, otpHash: string, otpExpiry: Date) {
  return prisma.patient.update({
    where: { id },
    data: { otp: otpHash, otpExpiry, otpAttempts: 0 },
    omit: omitSensitive,
  });
}

export async function clearPatientOtp(id: string) {
  return prisma.patient.update({
    where: { id },
    data: { otp: null, otpExpiry: null, otpAttempts: 0 },
    omit: omitSensitive,
  });
}

export async function incrementPatientOtpAttempts(id: string) {
  return prisma.patient.update({
    where: { id },
    data: { otpAttempts: { increment: 1 } },
    omit: omitSensitive,
  });
}

export async function updatePatientEmail(id: string, email: string) {
  return prisma.patient.update({ where: { id }, data: { email }, omit: omitSensitive });
}

// ── Attachments (upload / files routes) ──────────────────────────────────────

export interface AddAttachmentInput {
  filename: string;
  contentType?: string;
  size?: number;
  url?: string;
  uploadedById?: string;
  notes?: string;
}

export async function addPatientAttachment(patientId: string, attachment: AddAttachmentInput) {
  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: { attachments: { create: attachment } },
    omit: omitSensitive,
    include: fullInclude,
  });
  return toPatientDTO(patient as PatientWithRelations);
}

export async function removePatientAttachment(patientId: string, attachmentId: string) {
  await prisma.patientAttachment.deleteMany({ where: { id: attachmentId, patientId } });
  return getPatientById(patientId);
}

/** Total patient count in the active tenant (junction-scoped by the extension). */
export async function countPatients(): Promise<number> {
  return prisma.patient.count({});
}

// ── PH Data Privacy Act compliance support (app/api/compliance/*) ───────────

/**
 * Scrub PII on a patient's own row in place ("anonymize" deletion mode) —
 * keeps the row (and its FK'd clinical history) for legal/medical retention
 * requirements while removing identifying details. Explicit nulls (not the
 * `?? undefined` semantics flattenPatientInput/updatePatient use for partial
 * updates) so every PII column actually clears rather than being skipped.
 */
export async function anonymizePatient(id: string) {
  const patient = await prisma.patient.update({
    where: { id },
    data: {
      firstName: '[ANONYMIZED]',
      lastName: '[ANONYMIZED]',
      email: `anonymized-${id}@deleted.local`,
      phone: '[ANONYMIZED]',
      addressStreet: '[ANONYMIZED]',
      addressCity: '[ANONYMIZED]',
      addressState: '[ANONYMIZED]',
      addressZipCode: '[ANONYMIZED]',
      // dateOfBirth is a required (non-nullable) column in the Postgres schema
      // (Mongoose allowed clearing it to null; Prisma does not) — left as-is.
      identifierPhilHealth: null,
      identifierGovId: null,
      identifierOther: Prisma.JsonNull,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      emergencyContactRelation: null,
    },
    omit: omitSensitive,
    include: fullInclude,
  });
  return toPatientDTO(patient as PatientWithRelations);
}
