/**
 * Phase 3 data migration: MongoDB (Mongoose) -> PostgreSQL (Prisma).
 *
 * Run with:
 *   tsx scripts/migrate-to-postgres/migrate.ts                  # runs every collection, in order
 *   tsx scripts/migrate-to-postgres/migrate.ts --only=Patient   # runs a single collection
 *
 * See prisma/schema.prisma (authoritative target shape) and
 * prisma/MIGRATION_NOTES.md (judgment calls) before changing this file.
 *
 * Every Postgres write goes through runAsSystem() — migration scripts have
 * no per-request tenant context, and the tenant-scoping Prisma extension
 * throws without one.
 *
 * A row that fails to migrate aborts that collection's migration loudly
 * (throws) rather than silently skipping it — partial migration of
 * clinical/billing data is worse than stopping.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import mongoose, { Types } from 'mongoose';
import connectDB from '../../lib/mongodb';
import { prisma } from '../../lib/prisma';
import { runAsSystem } from '../../lib/tenant-context';
import { ensureIdMapTable, getOrCreateId, lookupId, requireLookupId } from './id-map';
import * as models from '../../models';
import PatientNoteModel from '../../models/PatientNote';
import PushSubscriptionModel from '../../models/PushSubscription';

const BATCH_SIZE = 500;

// ============================================================================
// Small shared helpers
// ============================================================================

/** Mongo ObjectId | string | null | undefined -> plain string, or undefined. */
function idStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Types.ObjectId) return v.toString();
  if (typeof v === 'string') return v;
  // Populated doc / anything with an _id
  const anyV = v as any;
  if (anyV._id) return idStr(anyV._id);
  return String(v);
}

/** Resolve a required ref to its Postgres UUID (throws if missing — dependency-ordering bug). */
async function reqRef(collection: string, v: unknown, context: string): Promise<string> {
  const s = idStr(v);
  if (!s) throw new Error(`[migrate] Missing required ref to ${collection} while migrating ${context}`);
  return requireLookupId(collection, s, context);
}

/** Resolve an optional ref to its Postgres UUID, or undefined if not set / not yet migrated. */
async function optRef(collection: string, v: unknown): Promise<string | undefined> {
  const s = idStr(v);
  if (!s) return undefined;
  const looked = await lookupId(collection, s);
  return looked ?? undefined;
}

/** Mongoose Map (or plain object) -> plain object for a Prisma Json column. Returns undefined for empty/absent maps. */
function mapToJson(v: unknown): Record<string, unknown> | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Map) {
    if (v.size === 0) return undefined;
    return Object.fromEntries(v.entries());
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj).length === 0 ? undefined : obj;
  }
  return undefined;
}

function asArray<T>(v: T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : [];
}

/** Shared shape for Attachment-derived child tables (PatientAttachment, VisitAttachment, ...). */
function attachmentCreate(a: any) {
  return {
    filename: a.filename,
    contentType: a.contentType ?? undefined,
    size: a.size ?? undefined,
    url: a.url ?? undefined,
    gridFsId: a.gridFsId ?? undefined,
    uploadedById: undefined as string | undefined, // resolved by caller if needed
    uploadDate: a.uploadDate ?? new Date(),
    notes: a.notes ?? undefined,
  };
}

async function attachmentsCreate(list: any[] | undefined) {
  const out = [];
  for (const a of asArray(list)) {
    const base = attachmentCreate(a);
    base.uploadedById = await optRef('User', a.uploadedBy);
    out.push(base);
  }
  return out;
}

/** Shared shape for {dayOfWeek, startTime, endTime, isAvailable} schedule slot child tables. */
function scheduleSlotCreate(list: any[] | undefined) {
  return asArray(list).map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    isAvailable: s.isAvailable ?? true,
  }));
}

/** Shared shape for {date, isAvailable, startTime, endTime, reason} availability override child tables. */
function availabilityOverrideCreate(list: any[] | undefined) {
  return asArray(list).map((o) => ({
    date: o.date,
    isAvailable: o.isAvailable,
    startTime: o.startTime ?? undefined,
    endTime: o.endTime ?? undefined,
    reason: o.reason ?? undefined,
  }));
}

/** Shared shape for {note, createdBy, createdAt, isImportant} internal-note child tables. */
async function internalNotesCreate(list: any[] | undefined) {
  const out = [];
  for (const n of asArray(list)) {
    out.push({
      note: n.note,
      createdById: idStr(n.createdBy), // informational string, no FK relation on these child tables
      createdAt: n.createdAt ?? new Date(),
      isImportant: n.isImportant ?? false,
    });
  }
  return out;
}

/** Generic batched migration runner: streams a Mongo cursor, transforms each doc, writes in
 *  transactional batches of `batchSize` via Prisma nested creates. Throws (aborts) on the
 *  first row that fails — no continue-on-error, per Phase 3 spec. */
async function runMigration<D = any>(
  name: string,
  cursor: AsyncIterable<D>,
  transform: (doc: D) => Promise<any>,
  create: (data: any) => Promise<unknown>,
  batchSize: number = BATCH_SIZE
): Promise<number> {
  let batch: Promise<unknown>[] = [];
  let total = 0;
  for await (const doc of cursor) {
    let data: any;
    try {
      data = await transform(doc);
    } catch (err) {
      throw new Error(`[migrate] ${name}: transform failed for doc ${idStr((doc as any)?._id)}: ${err}`);
    }
    batch.push(
      Promise.resolve(runAsSystem(() => create(data))).catch((err: unknown) => {
        throw new Error(`[migrate] ${name}: write failed for doc ${idStr((doc as any)?._id)}: ${err}`);
      })
    );
    if (batch.length >= batchSize) {
      await Promise.all(batch);
      total += batch.length;
      console.log(`[migrate] ${name}: ${total} migrated...`);
      batch = [];
    }
  }
  if (batch.length) {
    await Promise.all(batch);
    total += batch.length;
  }
  console.log(`[migrate] ${name}: DONE — ${total} rows migrated`);
  return total;
}

// ============================================================================
// Tenant
// ============================================================================

export async function migrateTenants(): Promise<number> {
  const cursor = models.Tenant.find().lean().cursor();
  return runMigration(
    'Tenant',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Tenant', idStr(doc._id)!),
      name: doc.name,
      subdomain: doc.subdomain,
      displayName: doc.displayName ?? undefined,
      email: doc.email ?? undefined,
      phone: doc.phone ?? undefined,
      addressStreet: doc.address?.street ?? undefined,
      addressCity: doc.address?.city ?? undefined,
      addressState: doc.address?.state ?? undefined,
      addressZipCode: doc.address?.zipCode ?? undefined,
      addressCountry: doc.address?.country ?? undefined,
      settingsTimezone: doc.settings?.timezone ?? 'UTC',
      settingsCurrency: doc.settings?.currency ?? 'PHP',
      settingsCurrencySymbol: doc.settings?.currencySymbol ?? undefined,
      settingsCurrencyPosition: doc.settings?.currencyPosition ?? undefined,
      settingsDateFormat: doc.settings?.dateFormat ?? 'MM/DD/YYYY',
      settingsTimeFormat: doc.settings?.timeFormat ?? undefined,
      settingsLanguage: doc.settings?.language ?? undefined,
      settingsNumberDecimalSep: doc.settings?.numberFormat?.decimalSeparator ?? undefined,
      settingsNumberThousandsSep: doc.settings?.numberFormat?.thousandsSeparator ?? undefined,
      settingsNumberDecimalPlaces: doc.settings?.numberFormat?.decimalPlaces ?? undefined,
      settingsLogo: doc.settings?.logo ?? undefined,
      settingsPrimaryColor: doc.settings?.primaryColor ?? undefined,
      settingsSecondaryColor: doc.settings?.secondaryColor ?? undefined,
      status: doc.status ?? 'active',
      subscriptionPlan: doc.subscription?.plan ?? undefined,
      subscriptionStatus: doc.subscription?.status ?? 'active',
      subscriptionBillingCycle: doc.subscription?.billingCycle ?? 'monthly',
      subscriptionExpiresAt: doc.subscription?.expiresAt ?? undefined,
      subscriptionRenewalAt: doc.subscription?.renewalAt ?? undefined,
      subscriptionPaypalOrderId: doc.subscription?.paypalOrderId ?? undefined,
      subscriptionPaypalSubscriptionId: doc.subscription?.paypalSubscriptionId ?? undefined,
      subscriptionProcessedWebhookIds: asArray(doc.subscription?.processedWebhookIds).map(String),
      paymentHistory: {
        create: asArray(doc.paymentHistory).map((p: any) => ({
          transactionId: p.transactionId,
          orderId: p.orderId,
          amount: p.amount,
          currency: p.currency ?? 'USD',
          payerEmail: p.payerEmail ?? undefined,
          plan: p.plan,
          billingCycle: p.billingCycle ?? 'monthly',
          status: p.status ?? 'completed',
          paidAt: p.paidAt ?? new Date(),
        })),
      },
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.tenant.create({ data })
  );
}

// ============================================================================
// Lookup / catalog tables: Specialization, Room, Service, Medicine, Product
// ============================================================================

export async function migrateSpecializations(): Promise<number> {
  const cursor = models.Specialization.find().lean().cursor();
  return runMigration(
    'Specialization',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Specialization', idStr(doc._id)!),
      name: doc.name,
      description: doc.description ?? undefined,
      category: doc.category ?? undefined,
      active: doc.active ?? true,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.specialization.create({ data })
  );
}

export async function migrateRooms(): Promise<number> {
  const cursor = models.Room.find().lean().cursor();
  return runMigration(
    'Room',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Room', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      name: doc.name,
      roomNumber: doc.roomNumber ?? undefined,
      floor: doc.floor ?? undefined,
      building: doc.building ?? undefined,
      roomType: doc.roomType ?? 'consultation',
      capacity: doc.capacity ?? undefined,
      equipment: asArray(doc.equipment),
      amenities: asArray(doc.amenities),
      status: doc.status ?? 'available',
      notes: doc.notes ?? undefined,
      schedule: { create: scheduleSlotCreate(doc.schedule) },
      availabilityOverrides: { create: availabilityOverrideCreate(doc.availabilityOverrides) },
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.room.create({ data })
  );
}

export async function migrateServices(): Promise<number> {
  const cursor = models.Service.find().lean().cursor();
  return runMigration(
    'Service',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Service', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      code: doc.code,
      name: doc.name,
      description: doc.description ?? undefined,
      category: doc.category,
      type: doc.type ?? undefined,
      unitPrice: doc.unitPrice,
      unit: doc.unit ?? 'per service',
      duration: doc.duration ?? undefined,
      requiresDoctor: doc.requiresDoctor ?? false,
      active: doc.active ?? true,
      notes: doc.notes ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.service.create({ data })
  );
}

export async function migrateMedicines(): Promise<number> {
  const cursor = models.Medicine.find().lean().cursor();
  return runMigration(
    'Medicine',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Medicine', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      name: doc.name,
      genericName: doc.genericName ?? undefined,
      brandNames: asArray(doc.brandNames),
      form: doc.form,
      strength: doc.strength,
      unit: doc.unit,
      route: doc.route,
      category: doc.category,
      indications: asArray(doc.indications),
      contraindications: asArray(doc.contraindications),
      sideEffects: asArray(doc.sideEffects),
      dosageRanges: {
        create: asArray(doc.dosageRanges).map((r: any) => ({
          minAge: r.minAge ?? undefined,
          maxAge: r.maxAge ?? undefined,
          minWeight: r.minWeight ?? undefined,
          maxWeight: r.maxWeight ?? undefined,
          dose: r.dose,
          frequency: r.frequency,
          maxDailyDose: r.maxDailyDose ?? undefined,
        })),
      },
      standardDosage: doc.standardDosage ?? undefined,
      standardFrequency: doc.standardFrequency ?? undefined,
      duration: doc.duration ?? undefined,
      requiresPrescription: doc.requiresPrescription ?? true,
      controlledSubstance: doc.controlledSubstance ?? false,
      schedule: doc.schedule ?? undefined,
      active: doc.active ?? true,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.medicine.create({ data })
  );
}

// Product depends on User (userId required) and optionally MedicalRepresentative — migrated
// after both, see main() ordering.
export async function migrateProducts(): Promise<number> {
  const cursor = models.Product.find().lean().cursor();
  return runMigration(
    'Product',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Product', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      userId: await reqRef('User', doc.userId ?? doc.user, 'Product'),
      medicalRepresentativeId: await optRef('MedicalRepresentative', doc.medicalRepresentativeId ?? doc.medicalRepresentative),
      name: doc.name,
      category: doc.category,
      manufacturer: doc.manufacturer,
      description: doc.description,
      dosage: doc.dosage ?? undefined,
      strength: doc.strength ?? undefined,
      packaging: doc.packaging,
      expiryDate: doc.expiryDate,
      status: doc.status ?? 'active',
      specifications: asArray(doc.specifications),
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.product.create({ data })
  );
}

// ============================================================================
// Role / Permission
// ============================================================================

export async function migrateRoles(): Promise<number> {
  const cursor = models.Role.find().lean().cursor();
  return runMigration(
    'Role',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Role', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      name: doc.name,
      displayName: doc.displayName,
      description: doc.description ?? undefined,
      level: doc.level ?? undefined,
      isActive: doc.isActive ?? true,
      defaultPermissions: {
        create: asArray(doc.defaultPermissions).map((p: any) => ({
          resource: p.resource,
          actions: asArray(p.actions),
        })),
      },
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.role.create({ data })
  );
}

// Permission has a Role<->Permission M2M (`roles`) plus an independent optional `userId` FK.
// The M2M side is populated here by connecting to already-migrated Roles; the `userId` FK is
// backfilled in a second pass after User is migrated (see migratePermissionUserLinks below).
export async function migratePermissions(): Promise<number> {
  const cursor = models.Permission.find().lean().cursor();
  return runMigration(
    'Permission',
    cursor,
    async (doc: any) => {
      const roleIds: string[] = [];
      // Mongoose Permission may reference a single `role` or be reached via Role.permissions[].
      const roleRef = idStr(doc.role);
      if (roleRef) {
        const mapped = await lookupId('Role', roleRef);
        if (mapped) roleIds.push(mapped);
      }
      return {
        id: await getOrCreateId('Permission', idStr(doc._id)!),
        tenantId: await optRef('Tenant', doc.tenantId),
        resource: doc.resource,
        actions: asArray(doc.actions),
        roles: roleIds.length ? { connect: roleIds.map((id) => ({ id })) } : undefined,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      };
    },
    (data) => prisma.permission.create({ data })
  );
}

/** Second pass: set Permission.userId for permissions that were assigned directly to a user
 *  (not via a role). Run after migrateUsers(). */
export async function migratePermissionUserLinks(): Promise<number> {
  let updated = 0;
  const cursor = models.Permission.find({ user: { $ne: null } }).lean().cursor();
  for await (const doc of cursor as any) {
    const pgId = await lookupId('Permission', idStr(doc._id)!);
    const userPgId = await optRef('User', doc.user);
    if (!pgId || !userPgId) continue;
    await runAsSystem(() => prisma.permission.update({ where: { id: pgId }, data: { userId: userPgId } }));
    updated++;
  }
  console.log(`[migrate] Permission user links: ${updated} updated`);
  return updated;
}

// ============================================================================
// Profile models: Staff / Admin / Doctor / Nurse / Receptionist / Accountant / MedicalRepresentative
// ============================================================================

function emergencyContactFields(doc: any) {
  return {
    emergencyContactName: doc.emergencyContact?.name ?? undefined,
    emergencyContactPhone: doc.emergencyContact?.phone ?? undefined,
    emergencyContactRelationship: doc.emergencyContact?.relationship ?? undefined,
  };
}

export async function migrateStaff(): Promise<number> {
  const cursor = models.Staff.find().lean().cursor();
  return runMigration(
    'Staff',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Staff', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      phone: doc.phone,
      staffType: doc.staffType ?? undefined,
      employeeId: doc.employeeId ?? undefined,
      department: doc.department ?? undefined,
      position: doc.position ?? undefined,
      hireDate: doc.hireDate ?? undefined,
      address: doc.address ?? undefined,
      ...emergencyContactFields(doc),
      status: doc.status ?? 'active',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.staff.create({ data })
  );
}

export async function migrateAdmins(): Promise<number> {
  const cursor = models.Admin.find().lean().cursor();
  return runMigration(
    'Admin',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Admin', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      phone: doc.phone ?? undefined,
      title: doc.title ?? undefined,
      department: doc.department ?? undefined,
      accessLevel: doc.accessLevel ?? 'full',
      internalNotes: { create: await internalNotesCreate(doc.internalNotes) },
      bio: doc.bio ?? undefined,
      status: doc.status ?? 'active',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.admin.create({ data })
  );
}

export async function migrateDoctors(): Promise<number> {
  const cursor = models.Doctor.find().lean().cursor();
  return runMigration(
    'Doctor',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Doctor', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      phone: doc.phone,
      specializationId: await reqRef('Specialization', doc.specializationId ?? doc.specialization, 'Doctor'),
      licenseNumber: doc.licenseNumber,
      ptr: doc.ptr ?? '',
      schedule: { create: scheduleSlotCreate(doc.schedule) },
      availabilityOverrides: { create: availabilityOverrideCreate(doc.availabilityOverrides) },
      internalNotes: { create: await internalNotesCreate(doc.internalNotes) },
      perfTotalAppointments: doc.performanceMetrics?.totalAppointments ?? 0,
      perfCompletedAppointments: doc.performanceMetrics?.completedAppointments ?? 0,
      perfCancelledAppointments: doc.performanceMetrics?.cancelledAppointments ?? 0,
      perfNoShowAppointments: doc.performanceMetrics?.noShowAppointments ?? 0,
      perfAverageRating: doc.performanceMetrics?.averageRating ?? undefined,
      perfLastUpdated: doc.performanceMetrics?.lastUpdated ?? undefined,
      title: doc.title ?? undefined,
      qualifications: asArray(doc.qualifications),
      bio: doc.bio ?? undefined,
      department: doc.department ?? undefined,
      status: doc.status ?? 'active',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.doctor.create({ data })
  );
}

export async function migrateNurses(): Promise<number> {
  const cursor = models.Nurse.find().lean().cursor();
  return runMigration(
    'Nurse',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Nurse', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      phone: doc.phone,
      employeeId: doc.employeeId ?? undefined,
      licenseNumber: doc.licenseNumber ?? undefined,
      department: doc.department ?? undefined,
      specialization: doc.specialization ?? undefined,
      hireDate: doc.hireDate ?? undefined,
      address: doc.address ?? undefined,
      schedule: { create: scheduleSlotCreate(doc.schedule) },
      availabilityOverrides: { create: availabilityOverrideCreate(doc.availabilityOverrides) },
      ...emergencyContactFields(doc),
      internalNotes: { create: await internalNotesCreate(doc.internalNotes) },
      perfTotalVisits: doc.performanceMetrics?.totalVisits ?? 0,
      perfCompletedVisits: doc.performanceMetrics?.completedVisits ?? 0,
      perfCancelledVisits: doc.performanceMetrics?.cancelledVisits ?? 0,
      perfLastUpdated: doc.performanceMetrics?.lastUpdated ?? undefined,
      title: doc.title ?? undefined,
      qualifications: asArray(doc.qualifications),
      bio: doc.bio ?? undefined,
      status: doc.status ?? 'active',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.nurse.create({ data })
  );
}

export async function migrateReceptionists(): Promise<number> {
  const cursor = models.Receptionist.find().lean().cursor();
  return runMigration(
    'Receptionist',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Receptionist', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      phone: doc.phone,
      employeeId: doc.employeeId ?? undefined,
      department: doc.department ?? undefined,
      hireDate: doc.hireDate ?? undefined,
      address: doc.address ?? undefined,
      schedule: { create: scheduleSlotCreate(doc.schedule) },
      availabilityOverrides: { create: availabilityOverrideCreate(doc.availabilityOverrides) },
      ...emergencyContactFields(doc),
      internalNotes: { create: await internalNotesCreate(doc.internalNotes) },
      perfTotalAppointments: doc.performanceMetrics?.totalAppointments ?? 0,
      perfScheduledAppointments: doc.performanceMetrics?.scheduledAppointments ?? 0,
      perfCancelledAppointments: doc.performanceMetrics?.cancelledAppointments ?? 0,
      perfLastUpdated: doc.performanceMetrics?.lastUpdated ?? undefined,
      title: doc.title ?? undefined,
      bio: doc.bio ?? undefined,
      status: doc.status ?? 'active',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.receptionist.create({ data })
  );
}

export async function migrateAccountants(): Promise<number> {
  const cursor = models.Accountant.find().lean().cursor();
  return runMigration(
    'Accountant',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Accountant', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      phone: doc.phone,
      employeeId: doc.employeeId ?? undefined,
      department: doc.department ?? undefined,
      hireDate: doc.hireDate ?? undefined,
      address: doc.address ?? undefined,
      certification: doc.certification ?? undefined,
      licenseNumber: doc.licenseNumber ?? undefined,
      schedule: { create: scheduleSlotCreate(doc.schedule) },
      availabilityOverrides: { create: availabilityOverrideCreate(doc.availabilityOverrides) },
      ...emergencyContactFields(doc),
      internalNotes: { create: await internalNotesCreate(doc.internalNotes) },
      perfTotalInvoices: doc.performanceMetrics?.totalInvoices ?? 0,
      perfProcessedInvoices: doc.performanceMetrics?.processedInvoices ?? 0,
      perfTotalRevenue: doc.performanceMetrics?.totalRevenue ?? 0,
      perfLastUpdated: doc.performanceMetrics?.lastUpdated ?? undefined,
      title: doc.title ?? undefined,
      bio: doc.bio ?? undefined,
      status: doc.status ?? 'active',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.accountant.create({ data })
  );
}

export async function migrateMedicalRepresentatives(): Promise<number> {
  const cursor = models.MedicalRepresentative.find().lean().cursor();
  return runMigration(
    'MedicalRepresentative',
    cursor,
    async (doc: any) => {
      const pgId = await getOrCreateId('MedicalRepresentative', idStr(doc._id)!);
      const tenantIds = asArray(doc.tenantIds);
      const tenantJunction = [];
      for (const t of tenantIds) {
        const tId = await optRef('Tenant', t);
        if (tId) tenantJunction.push({ tenantId: tId });
      }
      return {
        id: pgId,
        tenants: { create: tenantJunction },
        firstName: doc.firstName,
        lastName: doc.lastName,
        email: doc.email,
        phone: doc.phone,
        company: doc.company,
        territory: doc.territory ?? undefined,
        products: asArray(doc.products),
        availability: { create: scheduleSlotCreate(doc.availability) },
        availabilityOverrides: { create: availabilityOverrideCreate(doc.availabilityOverrides) },
        internalNotes: { create: await internalNotesCreate(doc.internalNotes) },
        perfTotalVisits: doc.performanceMetrics?.totalVisits ?? 0,
        perfCompletedVisits: doc.performanceMetrics?.completedVisits ?? 0,
        perfCancelledVisits: doc.performanceMetrics?.cancelledVisits ?? 0,
        perfLastUpdated: doc.performanceMetrics?.lastUpdated ?? undefined,
        title: doc.title ?? undefined,
        bio: doc.bio ?? undefined,
        status: doc.status ?? 'inactive',
        isActivated: doc.isActivated ?? false,
        activationDate: doc.activationDate ?? undefined,
        paymentStatus: doc.paymentStatus ?? 'pending',
        paymentDate: doc.paymentDate ?? undefined,
        paymentAmount: doc.paymentAmount ?? undefined,
        paymentMethod: doc.paymentMethod ?? undefined,
        paymentReference: doc.paymentReference ?? undefined,
        lastLogin: doc.lastLogin ?? undefined,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      };
    },
    (data) => prisma.medicalRepresentative.create({ data })
  );
}

// ============================================================================
// User
// ============================================================================

export async function migrateUsers(): Promise<number> {
  const cursor = models.User.find().lean().cursor();
  return runMigration(
    'User',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('User', idStr(doc._id)!),
      name: doc.name,
      email: doc.email,
      password: doc.password,
      tenantId: await optRef('Tenant', doc.tenantId),
      roleId: await reqRef('Role', doc.role ?? doc.roleId, 'User'),
      staffInfoId: await optRef('Staff', doc.staffInfo ?? doc.staffInfoId),
      adminProfileId: await optRef('Admin', doc.adminProfile),
      doctorProfileId: await optRef('Doctor', doc.doctorProfile),
      nurseProfileId: await optRef('Nurse', doc.nurseProfile),
      receptionistProfileId: await optRef('Receptionist', doc.receptionistProfile),
      accountantProfileId: await optRef('Accountant', doc.accountantProfile),
      medicalRepresentativeProfileId: await optRef('MedicalRepresentative', doc.medicalRepresentativeProfile),
      status: doc.status ?? 'active',
      lastLogin: doc.lastLogin ?? undefined,
      totpSecret: doc.totpSecret ?? undefined,
      totpEnabled: doc.totpEnabled ?? false,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.user.create({ data })
  );
}

// ============================================================================
// Patient (+ PatientTenant, + PatientAllergy, + more)
// ============================================================================

export async function migratePatients(): Promise<number> {
  const cursor = models.Patient.find().lean().cursor();
  return runMigration(
    'Patient',
    cursor,
    async (doc: any) => {
      const tenantIds = asArray(doc.tenantIds);
      const tenantJunction = [];
      for (const t of tenantIds) {
        const tId = await optRef('Tenant', t);
        if (tId) tenantJunction.push({ tenantId: tId });
      }

      // allergies: Mongoose Mixed (string | {substance, reaction, severity}) -> PatientAllergy rows
      const allergyRows = asArray(doc.allergies).map((a: any) => {
        if (typeof a === 'string') {
          return { rawText: a, substance: undefined, reaction: undefined, severity: undefined };
        }
        return {
          rawText: undefined,
          substance: a?.substance ?? undefined,
          reaction: a?.reaction ?? undefined,
          severity: a?.severity ?? undefined,
        };
      });

      return {
        id: await getOrCreateId('Patient', idStr(doc._id)!),
        tenants: { create: tenantJunction },
        patientCode: doc.patientCode ?? undefined,
        firstName: doc.firstName,
        middleName: doc.middleName ?? undefined,
        lastName: doc.lastName,
        suffix: doc.suffix ?? undefined,
        dateOfBirth: doc.dateOfBirth,
        sex: doc.sex,
        civilStatus: doc.civilStatus ?? undefined,
        nationality: doc.nationality ?? undefined,
        occupation: doc.occupation ?? undefined,
        email: doc.email ?? undefined,
        phone: doc.phone,
        contactsPhone: doc.contacts?.phone ?? undefined,
        contactsEmail: doc.contacts?.email ?? undefined,
        contactsAddress: doc.contacts?.address ?? undefined,
        addressStreet: doc.address?.street ?? '',
        addressCity: doc.address?.city ?? '',
        addressState: doc.address?.state ?? '',
        addressZipCode: doc.address?.zipCode ?? '',
        emergencyContactName: doc.emergencyContact?.name ?? undefined,
        emergencyContactPhone: doc.emergencyContact?.phone ?? undefined,
        emergencyContactRelationship: doc.emergencyContact?.relationship ?? undefined,
        emergencyContactRelation: doc.emergencyContact?.relation ?? undefined,
        identifierPhilHealth: doc.identifiers?.philHealth ?? undefined,
        identifierGovId: doc.identifiers?.govId ?? undefined,
        identifierOther: mapToJson(doc.identifiers?.other),
        medicalHistory: doc.medicalHistory ?? '',
        preExistingConditions: {
          create: asArray(doc.preExistingConditions).map((c: any) => ({
            condition: c.condition,
            diagnosisDate: c.diagnosisDate ?? undefined,
            status: c.status ?? 'active',
            notes: c.notes ?? undefined,
          })),
        },
        allergies: { create: allergyRows },
        immunizations: {
          create: asArray(doc.immunizations).map((i: any) => ({
            name: i.name,
            date: i.date,
            batch: i.batch ?? undefined,
            notes: i.notes ?? undefined,
          })),
        },
        socialHistorySmoker: doc.socialHistory?.smoker ?? 'unknown',
        socialHistoryAlcohol: doc.socialHistory?.alcohol ?? 'unknown',
        socialHistoryDrugs: doc.socialHistory?.drugs ?? 'unknown',
        socialHistoryNotes: doc.socialHistory?.notes ?? undefined,
        familyHistory: mapToJson(doc.familyHistory),
        pwdEligible: doc.discountEligibility?.pwd?.eligible ?? undefined,
        pwdIdNumber: doc.discountEligibility?.pwd?.idNumber ?? undefined,
        pwdExpiryDate: doc.discountEligibility?.pwd?.expiryDate ?? undefined,
        seniorEligible: doc.discountEligibility?.senior?.eligible ?? undefined,
        seniorIdNumber: doc.discountEligibility?.senior?.idNumber ?? undefined,
        membershipDiscEligible: doc.discountEligibility?.membership?.eligible ?? undefined,
        membershipDiscType: doc.discountEligibility?.membership?.type ?? undefined,
        membershipDiscNumber: doc.discountEligibility?.membership?.number ?? undefined,
        membershipDiscExpiryDate: doc.discountEligibility?.membership?.expiryDate ?? undefined,
        membershipDiscPercentage: doc.discountEligibility?.membership?.percentage ?? undefined,
        password: doc.password ?? undefined,
        otp: doc.otp ?? undefined,
        otpExpiry: doc.otpExpiry ?? undefined,
        otpAttempts: doc.otpAttempts ?? 0,
        readNotificationIds: asArray(doc.readNotificationIds).map(String),
        active: doc.active ?? true,
        attachments: { create: await attachmentsCreate(doc.attachments) },
        tags: asArray(doc.tags),
        segFlagIsVIP: doc.segmentFlags?.isVIP ?? false,
        segFlagIsHighRisk: doc.segmentFlags?.isHighRisk ?? false,
        segFlagIsHighUtilizer: doc.segmentFlags?.isHighUtilizer ?? false,
        segFlagHasRecurringNoShow: doc.segmentFlags?.hasRecurringNoShow ?? false,
        segFlagIsPendingVerification: doc.segmentFlags?.isPendingVerification ?? false,
        segFlagHasOutstandingBalance: doc.segmentFlags?.hasOutstandingBalance ?? false,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      };
    },
    (data) => prisma.patient.create({ data })
  );
}

// ============================================================================
// PatientNote
// ============================================================================

export async function migratePatientNotes(): Promise<number> {
  const cursor = PatientNoteModel.find().lean().cursor();
  return runMigration(
    'PatientNote',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('PatientNote', idStr(doc._id)!),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'PatientNote'),
      authorUserId: idStr(doc.author?.userId) ?? '',
      authorName: doc.author?.name ?? '',
      authorRole: doc.author?.role ?? '',
      content: doc.content,
      visibility: doc.visibility ?? 'internal',
      priority: doc.priority ?? 'normal',
      tags: asArray(doc.tags),
      attachments: {
        create: asArray(doc.attachments).map((a: any) => ({
          url: a.url ?? undefined,
          name: a.name ?? undefined,
          type: a.type ?? undefined,
          uploadedAt: a.uploadedAt ?? new Date(),
        })),
      },
      tenantId: await optRef('Tenant', doc.tenantId),
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.patientNote.create({ data })
  );
}

// ============================================================================
// Appointment
// ============================================================================

export async function migrateAppointments(): Promise<number> {
  const cursor = models.Appointment.find().lean().cursor();
  return runMigration(
    'Appointment',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Appointment', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Appointment'),
      doctorId: await optRef('Doctor', doc.doctor ?? doc.doctorId),
      providerId: await optRef('User', doc.provider ?? doc.providerId),
      appointmentCode: doc.appointmentCode ?? undefined,
      appointmentDate: doc.appointmentDate ?? undefined,
      appointmentTime: doc.appointmentTime ?? undefined,
      scheduledAt: doc.scheduledAt ?? undefined,
      duration: doc.duration ?? 30,
      status: doc.status ?? 'scheduled',
      isWalkIn: doc.isWalkIn ?? false,
      queueNumber: doc.queueNumber ?? undefined,
      estimatedWaitTime: doc.estimatedWaitTime ?? undefined,
      queueId: idStr(doc.queueId) ?? undefined, // informational only, no FK relation per schema
      room: doc.room ?? undefined,
      reason: doc.reason ?? undefined,
      notes: doc.notes ?? '',
      createdById: await optRef('User', doc.createdBy ?? doc.createdById),
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.appointment.create({ data })
  );
}

// ============================================================================
// Visit
// ============================================================================

export async function migrateVisits(): Promise<number> {
  const cursor = models.Visit.find().lean().cursor();
  return runMigration(
    'Visit',
    cursor,
    async (doc: any) => {
      const digitalSig = doc.digitalSignature;
      const hasFullSig = digitalSig && digitalSig.providerName && digitalSig.providerId && digitalSig.signatureData;

      return {
        id: await getOrCreateId('Visit', idStr(doc._id)!),
        tenantId: await optRef('Tenant', doc.tenantId),
        patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Visit'),
        visitCode: doc.visitCode,
        date: doc.date ?? new Date(),
        providerId: await optRef('User', doc.provider ?? doc.providerId),
        visitType: doc.visitType ?? 'consultation',
        chiefComplaint: doc.chiefComplaint ?? undefined,
        historyOfPresentIllness: doc.historyOfPresentIllness ?? undefined,
        admittingImpression: doc.admittingImpression ?? undefined,
        vitalsBp: doc.vitals?.bp ?? undefined,
        vitalsHr: doc.vitals?.hr ?? undefined,
        vitalsRr: doc.vitals?.rr ?? undefined,
        vitalsTempC: doc.vitals?.tempC ?? undefined,
        vitalsSpo2: doc.vitals?.spo2 ?? undefined,
        vitalsHeightCm: doc.vitals?.heightCm ?? undefined,
        vitalsWeightKg: doc.vitals?.weightKg ?? undefined,
        vitalsBmi: doc.vitals?.bmi ?? undefined,
        peGeneral: doc.physicalExam?.general ?? undefined,
        peHeadEent: doc.physicalExam?.headEent ?? undefined,
        peHeent: doc.physicalExam?.heent ?? undefined,
        peChest: doc.physicalExam?.chest ?? undefined,
        peLungs: doc.physicalExam?.lungs ?? undefined,
        peCardiovascular: doc.physicalExam?.cardiovascular ?? undefined,
        peAbdomen: doc.physicalExam?.abdomen ?? undefined,
        peExtremities: doc.physicalExam?.extremities ?? undefined,
        peNeuro: doc.physicalExam?.neuro ?? undefined,
        peNeurological: doc.physicalExam?.neurological ?? undefined,
        peSkin: doc.physicalExam?.skin ?? undefined,
        peLymphNotes: doc.physicalExam?.lymphNotes ?? undefined,
        peBreast: doc.physicalExam?.breast ?? undefined,
        peRectum: doc.physicalExam?.rectum ?? undefined,
        peGenitalia: doc.physicalExam?.genitalia ?? undefined,
        peMusculoskeletal: doc.physicalExam?.musculoskeletal ?? undefined,
        peOther: doc.physicalExam?.other ?? undefined,
        diagnoses: {
          create: asArray(doc.diagnoses).map((d: any) => ({
            code: d.code ?? undefined,
            description: d.description ?? undefined,
            primary: d.primary ?? false,
          })),
        },
        assessment: doc.assessment ?? undefined,
        plan: doc.plan ?? undefined,
        soapSubjective: doc.soapNotes?.subjective ?? undefined,
        soapObjective: doc.soapNotes?.objective ?? undefined,
        soapAssessment: doc.soapNotes?.assessment ?? undefined,
        soapPlan: doc.soapNotes?.plan ?? undefined,
        treatmentMedications: {
          create: asArray(doc.treatmentPlan?.medications).map((m: any) => ({
            name: m.name,
            dosage: m.dosage ?? undefined,
            frequency: m.frequency ?? undefined,
            duration: m.duration ?? undefined,
            quantity: m.quantity ?? undefined,
            instructions: m.instructions ?? undefined,
          })),
        },
        treatmentProcedures: {
          create: asArray(doc.treatmentPlan?.procedures).map((p: any) => ({
            name: p.name,
            description: p.description ?? undefined,
            scheduledDate: p.scheduledDate ?? undefined,
          })),
        },
        treatmentLifestyle: {
          create: asArray(doc.treatmentPlan?.lifestyle).map((l: any) => ({
            category: l.category ?? undefined,
            instructions: l.instructions,
          })),
        },
        treatmentFollowUpDate: doc.treatmentPlan?.followUp?.date ?? undefined,
        treatmentFollowUpInstructions: doc.treatmentPlan?.followUp?.instructions ?? undefined,
        treatmentFollowUpReminderSent: doc.treatmentPlan?.followUp?.reminderSent ?? false,
        digitalSignature: hasFullSig
          ? {
              create: {
                providerName: digitalSig.providerName,
                providerId: await reqRef('User', digitalSig.providerId, 'Visit.digitalSignature'),
                signatureData: digitalSig.signatureData,
                signedAt: digitalSig.signedAt ?? new Date(),
                ipAddress: digitalSig.ipAddress ?? undefined,
              },
            }
          : undefined,
        attachments: { create: await attachmentsCreate(doc.attachments) },
        notes: doc.notes ?? undefined,
        followUpDate: doc.followUpDate ?? undefined,
        followUpReminderSent: doc.followUpReminderSent ?? false,
        feedbackRequested: doc.feedbackRequested ?? false,
        feedbackToken: doc.feedbackToken ?? undefined,
        status: doc.status ?? 'open',
        appointmentId: await optRef('Appointment', doc.appointment ?? doc.appointmentId),
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      };
    },
    (data) => prisma.visit.create({ data })
  );
}

// ============================================================================
// Prescription
// ============================================================================

export async function migratePrescriptions(): Promise<number> {
  const cursor = models.Prescription.find().lean().cursor();
  return runMigration(
    'Prescription',
    cursor,
    async (doc: any) => {
      const patientCopy = doc.copies?.patientCopy;
      const clinicCopy = doc.copies?.clinicCopy;
      return {
        id: await getOrCreateId('Prescription', idStr(doc._id)!),
        tenantId: await optRef('Tenant', doc.tenantId),
        prescriptionCode: doc.prescriptionCode,
        visitId: await optRef('Visit', doc.visit ?? doc.visitId),
        patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Prescription'),
        prescribedById: await optRef('User', doc.prescribedBy ?? doc.prescribedById),
        issuedAt: doc.issuedAt ?? new Date(),
        medications: {
          create: await Promise.all(
            asArray(doc.medications).map(async (m: any) => ({
              medicineId: await optRef('Medicine', m.medicineId),
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
            }))
          ),
        },
        notes: doc.notes ?? undefined,
        status: doc.status ?? 'active',
        pharmacyDispenseId: doc.pharmacyDispenseId ?? undefined,
        pharmacyDispenses: {
          create: asArray(doc.pharmacyDispenses).map((p: any) => ({
            pharmacyId: p.pharmacyId ?? undefined,
            pharmacyName: p.pharmacyName ?? undefined,
            dispensedAt: p.dispensedAt ?? undefined,
            dispensedBy: p.dispensedBy ?? undefined,
            quantityDispensed: p.quantityDispensed ?? undefined,
            notes: p.notes ?? undefined,
            trackingNumber: p.trackingNumber ?? undefined,
          })),
        },
        digitalSignatureProviderName: doc.digitalSignature?.providerName ?? undefined,
        digitalSignatureData: doc.digitalSignature?.signatureData ?? undefined,
        digitalSignatureSignedAt: doc.digitalSignature?.signedAt ?? undefined,
        printable: doc.printable ?? true,
        patientCopy: patientCopy
          ? {
              create: {
                printedAt: patientCopy.printedAt ?? undefined,
                printedById: await optRef('User', patientCopy.printedBy),
                digitalCopySent: patientCopy.digitalCopySent ?? false,
                sentAt: patientCopy.sentAt ?? undefined,
              },
            }
          : undefined,
        clinicCopy: clinicCopy
          ? {
              create: {
                archivedAt: clinicCopy.archivedAt ?? undefined,
                archivedById: await optRef('User', clinicCopy.archivedBy),
                location: clinicCopy.location ?? undefined,
              },
            }
          : undefined,
        drugInteractions: {
          create: asArray(doc.drugInteractions).map((d: any) => ({
            medication1: d.medication1,
            medication2: d.medication2,
            severity: d.severity,
            description: d.description,
            recommendation: d.recommendation ?? undefined,
            checkedAt: d.checkedAt ?? new Date(),
          })),
        },
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
      };
    },
    (data) => prisma.prescription.create({ data })
  );
}

// ============================================================================
// LabResult
// ============================================================================

export async function migrateLabResults(): Promise<number> {
  const cursor = models.LabResult.find().lean().cursor();
  return runMigration(
    'LabResult',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('LabResult', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'LabResult'),
      orderedById: await optRef('User', doc.orderedBy ?? doc.orderedById),
      orderDate: doc.orderDate ?? new Date(),
      requestCode: doc.requestCode ?? undefined,
      requestTestType: doc.request?.testType ?? '',
      requestTestCode: doc.request?.testCode ?? undefined,
      requestDescription: doc.request?.description ?? undefined,
      requestUrgency: doc.request?.urgency ?? 'routine',
      requestSpecialInstructions: doc.request?.specialInstructions ?? undefined,
      requestFastingRequired: doc.request?.fastingRequired ?? false,
      requestPreparationNotes: doc.request?.preparationNotes ?? undefined,
      thirdPartyLabName: doc.thirdPartyLab?.labName ?? undefined,
      thirdPartyLabId: doc.thirdPartyLab?.labId ?? undefined,
      thirdPartyLabCode: doc.thirdPartyLab?.labCode ?? undefined,
      thirdPartyIntegrationType: doc.thirdPartyLab?.integrationType ?? undefined,
      thirdPartyApiEndpoint: doc.thirdPartyLab?.apiEndpoint ?? undefined,
      thirdPartyApiKey: doc.thirdPartyLab?.apiKey ?? undefined,
      thirdPartyExternalRequestId: doc.thirdPartyLab?.externalRequestId ?? undefined,
      thirdPartyExternalResultId: doc.thirdPartyLab?.externalResultId ?? undefined,
      thirdPartyStatus: doc.thirdPartyLab?.status ?? undefined,
      thirdPartySentAt: doc.thirdPartyLab?.sentAt ?? undefined,
      thirdPartyReceivedAt: doc.thirdPartyLab?.receivedAt ?? undefined,
      thirdPartyErrorMessage: doc.thirdPartyLab?.errorMessage ?? undefined,
      results: mapToJson(doc.results),
      resultDate: doc.resultDate ?? undefined,
      interpretation: doc.interpretation ?? undefined,
      referenceRanges: mapToJson(doc.referenceRanges),
      abnormalFlags: mapToJson(doc.abnormalFlags),
      status: doc.status ?? 'ordered',
      attachments: { create: await attachmentsCreate(doc.attachments) },
      reviewedById: await optRef('User', doc.reviewedBy ?? doc.reviewedById),
      reviewedAt: doc.reviewedAt ?? undefined,
      notificationSent: doc.notificationSent ?? false,
      notificationSentAt: doc.notificationSentAt ?? undefined,
      notificationMethod: doc.notificationMethod ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.labResult.create({ data })
  );
}

// ============================================================================
// Imaging
// ============================================================================

export async function migrateImaging(): Promise<number> {
  const cursor = models.Imaging.find().lean().cursor();
  return runMigration(
    'Imaging',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Imaging', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Imaging'),
      orderedById: await optRef('User', doc.orderedBy ?? doc.orderedById),
      modality: doc.modality ?? undefined,
      bodyPart: doc.bodyPart ?? undefined,
      orderDate: doc.orderDate ?? new Date(),
      findings: doc.findings ?? undefined,
      impression: doc.impression ?? undefined,
      images: { create: await attachmentsCreate(doc.images) },
      status: doc.status ?? 'ordered',
      reportedById: await optRef('User', doc.reportedBy ?? doc.reportedById),
      reportedAt: doc.reportedAt ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.imaging.create({ data })
  );
}

// ============================================================================
// Procedure
// ============================================================================

export async function migrateProcedures(): Promise<number> {
  const cursor = models.Procedure.find().lean().cursor();
  return runMigration(
    'Procedure',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Procedure', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Procedure'),
      type: doc.type ?? undefined,
      performedById: await optRef('User', doc.performedBy ?? doc.performedById),
      date: doc.date ?? new Date(),
      details: doc.details ?? undefined,
      outcome: doc.outcome ?? undefined,
      attachments: { create: await attachmentsCreate(doc.attachments) },
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.procedure.create({ data })
  );
}

// ============================================================================
// Invoice (+ InvoiceLineItem, + InvoicePayment, + InvoiceDiscount)
// ============================================================================

export async function migrateInvoices(): Promise<number> {
  const cursor = models.Invoice.find().lean().cursor();
  return runMigration(
    'Invoice',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Invoice', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Invoice'),
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      invoiceNumber: doc.invoiceNumber,
      lineItems: {
        create: await Promise.all(
          asArray(doc.items).map(async (i: any) => ({
            serviceId: await optRef('Service', i.serviceId),
            code: i.code ?? undefined,
            description: i.description ?? undefined,
            category: i.category ?? undefined,
            quantity: i.quantity ?? 1,
            unitPrice: i.unitPrice ?? 0,
            total: i.total ?? 0,
          }))
        ),
      },
      subtotal: doc.subtotal ?? undefined,
      professionalFee: doc.professionalFee ?? 0,
      professionalFeeDoctorId: await optRef('Doctor', doc.professionalFeeDoctorId ?? doc.professionalFeeDoctor),
      professionalFeeType: doc.professionalFeeType ?? undefined,
      professionalFeeNotes: doc.professionalFeeNotes ?? undefined,
      discounts: {
        create: await Promise.all(
          asArray(doc.discounts).map(async (d: any) => ({
            type: d.type,
            reason: d.reason ?? undefined,
            percentage: d.percentage ?? undefined,
            amount: d.amount,
            appliedById: await optRef('User', d.appliedBy),
          }))
        ),
      },
      tax: doc.tax ?? undefined,
      total: doc.total ?? undefined,
      payments: {
        create: await Promise.all(
          asArray(doc.payments).map(async (p: any) => ({
            method: p.method,
            amount: p.amount,
            date: p.date ?? new Date(),
            receiptNo: p.receiptNo ?? undefined,
            referenceNo: p.referenceNo ?? undefined,
            processedById: await optRef('User', p.processedBy),
            notes: p.notes ?? undefined,
          }))
        ),
      },
      insuranceProvider: doc.insurance?.provider ?? undefined,
      insurancePolicyNumber: doc.insurance?.policyNumber ?? undefined,
      insuranceMemberId: doc.insurance?.memberId ?? undefined,
      insuranceCoverageType: doc.insurance?.coverageType ?? undefined,
      insuranceCoverageAmount: doc.insurance?.coverageAmount ?? undefined,
      insuranceClaimNumber: doc.insurance?.claimNumber ?? undefined,
      insuranceStatus: doc.insurance?.status ?? undefined,
      insuranceNotes: doc.insurance?.notes ?? undefined,
      outstandingBalance: doc.outstandingBalance ?? undefined,
      totalPaid: doc.totalPaid ?? undefined,
      status: doc.status ?? 'unpaid',
      createdById: await optRef('User', doc.createdBy ?? doc.createdById),
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.invoice.create({ data })
  );
}

// ============================================================================
// Referral
// ============================================================================

export async function migrateReferrals(): Promise<number> {
  const cursor = models.Referral.find().lean().cursor();
  return runMigration(
    'Referral',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Referral', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      referralCode: doc.referralCode ?? undefined,
      type: doc.type,
      referringDoctorId: await optRef('Doctor', doc.referringDoctor ?? doc.referringDoctorId),
      referringPatientId: await optRef('Patient', doc.referringPatient ?? doc.referringPatientId),
      referringClinic: doc.referringClinic ?? undefined,
      referringContactName: doc.referringContact?.name ?? undefined,
      referringContactPhone: doc.referringContact?.phone ?? undefined,
      referringContactEmail: doc.referringContact?.email ?? undefined,
      receivingDoctorId: await optRef('Doctor', doc.receivingDoctor ?? doc.receivingDoctorId),
      receivingClinic: doc.receivingClinic ?? undefined,
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Referral'),
      reason: doc.reason,
      urgency: doc.urgency ?? 'routine',
      specialty: doc.specialty ?? undefined,
      notes: doc.notes ?? undefined,
      chiefComplaint: doc.chiefComplaint ?? undefined,
      diagnosis: doc.diagnosis ?? undefined,
      relevantHistory: doc.relevantHistory ?? undefined,
      medications: asArray(doc.medications),
      attachments: {
        create: asArray(doc.attachments).map((a: any) => ({
          filename: a.filename,
          url: a.url,
          uploadDate: a.uploadDate ?? new Date(),
        })),
      },
      status: doc.status ?? 'pending',
      referredDate: doc.referredDate ?? new Date(),
      acceptedDate: doc.acceptedDate ?? undefined,
      completedDate: doc.completedDate ?? undefined,
      declinedDate: doc.declinedDate ?? undefined,
      declinedReason: doc.declinedReason ?? undefined,
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      appointmentId: await optRef('Appointment', doc.appointment ?? doc.appointmentId),
      followUpRequired: doc.followUpRequired ?? false,
      followUpDate: doc.followUpDate ?? undefined,
      followUpNotes: doc.followUpNotes ?? undefined,
      feedbackRating: doc.feedback?.rating ?? undefined,
      feedbackComments: doc.feedback?.comments ?? undefined,
      feedbackSubmittedById: await optRef('User', doc.feedback?.submittedBy),
      feedbackSubmittedAt: doc.feedback?.submittedAt ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.referral.create({ data })
  );
}

// ============================================================================
// Queue
// ============================================================================

export async function migrateQueues(): Promise<number> {
  const cursor = models.Queue.find().lean().cursor();
  return runMigration(
    'Queue',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Queue', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      queueNumber: doc.queueNumber ?? undefined,
      queueType: doc.queueType,
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Queue'),
      patientName: doc.patientName,
      appointmentId: await optRef('Appointment', doc.appointment ?? doc.appointmentId),
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      doctorId: await optRef('Doctor', doc.doctor ?? doc.doctorId),
      roomId: await optRef('Room', doc.room ?? doc.roomId),
      status: doc.status ?? 'waiting',
      priority: doc.priority ?? 0,
      estimatedWaitTime: doc.estimatedWaitTime ?? undefined,
      queuedAt: doc.queuedAt ?? new Date(),
      calledAt: doc.calledAt ?? undefined,
      startedAt: doc.startedAt ?? undefined,
      completedAt: doc.completedAt ?? undefined,
      checkedIn: doc.checkedIn ?? false,
      checkedInAt: doc.checkedInAt ?? undefined,
      checkInMethod: doc.checkInMethod ?? undefined,
      qrCode: doc.qrCode ?? undefined,
      consultationDuration: doc.consultationDuration ?? undefined,
      completionNotes: doc.completionNotes ?? undefined,
      nextAction: doc.nextAction ?? undefined,
      vitalsBp: doc.vitals?.bp ?? undefined,
      vitalsHr: doc.vitals?.hr ?? undefined,
      vitalsRr: doc.vitals?.rr ?? undefined,
      vitalsTempC: doc.vitals?.tempC ?? undefined,
      vitalsSpo2: doc.vitals?.spo2 ?? undefined,
      vitalsHeightCm: doc.vitals?.heightCm ?? undefined,
      vitalsWeightKg: doc.vitals?.weightKg ?? undefined,
      vitalsBmi: doc.vitals?.bmi ?? undefined,
      notes: doc.notes ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.queue.create({ data })
  );
}

// ============================================================================
// Document
// ============================================================================

export async function migrateDocuments(): Promise<number> {
  const cursor = models.Document.find().lean().cursor();
  return runMigration(
    'Document',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Document', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      documentCode: doc.documentCode,
      title: doc.title,
      description: doc.description ?? undefined,
      category: doc.category,
      documentType: doc.documentType,
      filename: doc.filename,
      originalFilename: doc.originalFilename,
      contentType: doc.contentType,
      size: doc.size,
      url: doc.url,
      thumbnailUrl: doc.thumbnailUrl ?? undefined,
      patientId: await optRef('Patient', doc.patient ?? doc.patientId),
      visitId: await optRef('Visit', doc.visit ?? doc.visitId),
      appointmentId: await optRef('Appointment', doc.appointment ?? doc.appointmentId),
      labResultId: await optRef('LabResult', doc.labResult ?? doc.labResultId),
      invoiceId: await optRef('Invoice', doc.invoice ?? doc.invoiceId),
      tags: asArray(doc.tags),
      scanned: doc.scanned ?? false,
      ocrText: doc.ocrText ?? undefined,
      expiryDate: doc.expiryDate ?? undefined,
      metadata: mapToJson(doc.metadata),
      referralReferringDoctor: doc.referral?.referringDoctor ?? undefined,
      referralReferringClinic: doc.referral?.referringClinic ?? undefined,
      referralDate: doc.referral?.date ?? undefined,
      referralReason: doc.referral?.reason ?? undefined,
      imagingModality: doc.imaging?.modality ?? undefined,
      imagingBodyPart: doc.imaging?.bodyPart ?? undefined,
      imagingStudyDate: doc.imaging?.studyDate ?? undefined,
      imagingRadiologist: doc.imaging?.radiologist ?? undefined,
      medCertIssueDate: doc.medicalCertificate?.issueDate ?? undefined,
      medCertValidUntil: doc.medicalCertificate?.validUntil ?? undefined,
      medCertPurpose: doc.medicalCertificate?.purpose ?? undefined,
      medCertRestrictions: doc.medicalCertificate?.restrictions ?? undefined,
      labMetaTestType: doc.labResultMetadata?.testType ?? undefined,
      labMetaTestDate: doc.labResultMetadata?.testDate ?? undefined,
      labMetaLabName: doc.labResultMetadata?.labName ?? undefined,
      uploadedById: await reqRef('User', doc.uploadedBy ?? doc.uploadedById, 'Document'),
      uploadDate: doc.uploadDate ?? new Date(),
      lastModifiedById: await optRef('User', doc.lastModifiedBy ?? doc.lastModifiedById),
      lastModifiedDate: doc.lastModifiedDate ?? undefined,
      status: doc.status ?? 'active',
      isConfidential: doc.isConfidential ?? false,
      notes: doc.notes ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.document.create({ data })
  );
}

// ============================================================================
// Membership (+ MembershipTransaction)
// ============================================================================

export async function migrateMemberships(): Promise<number> {
  const cursor = models.Membership.find().lean().cursor();
  return runMigration(
    'Membership',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Membership', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      patientId: await reqRef('Patient', doc.patient ?? doc.patientId, 'Membership'),
      membershipNumber: doc.membershipNumber,
      tier: doc.tier ?? 'bronze',
      status: doc.status ?? 'active',
      points: doc.points ?? 0,
      totalPointsEarned: doc.totalPointsEarned ?? 0,
      totalPointsRedeemed: doc.totalPointsRedeemed ?? 0,
      joinDate: doc.joinDate ?? new Date(),
      expiryDate: doc.expiryDate ?? undefined,
      renewalDate: doc.renewalDate ?? undefined,
      discountPercentage: doc.discountPercentage ?? 0,
      benefits: asArray(doc.benefits),
      referredById: await optRef('Patient', doc.referredBy ?? doc.referredById),
      transactions: {
        create: asArray(doc.transactions).map((t: any) => ({
          type: t.type,
          points: t.points,
          description: t.description,
          relatedEntityType: t.relatedEntity?.type ?? undefined,
          relatedEntityId: idStr(t.relatedEntity?.id) ?? undefined,
          createdAt: t.createdAt ?? new Date(),
        })),
      },
      notes: doc.notes ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.membership.create({ data })
  );
}

// ============================================================================
// Inventory
// ============================================================================

export async function migrateInventory(): Promise<number> {
  const cursor = models.InventoryItem.find().lean().cursor();
  return runMigration(
    'InventoryItem',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('InventoryItem', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      medicineId: await optRef('Medicine', doc.medicineId ?? doc.medicine),
      name: doc.name,
      category: doc.category,
      sku: doc.sku ?? undefined,
      quantity: doc.quantity ?? 0,
      unit: doc.unit ?? 'pieces',
      reorderLevel: doc.reorderLevel ?? 10,
      reorderQuantity: doc.reorderQuantity ?? 50,
      unitCost: doc.unitCost ?? 0,
      supplier: doc.supplier ?? undefined,
      expiryDate: doc.expiryDate ?? undefined,
      location: doc.location ?? undefined,
      notes: doc.notes ?? undefined,
      lastRestocked: doc.lastRestocked ?? undefined,
      lastRestockedById: await optRef('User', doc.lastRestockedBy ?? doc.lastRestockedById),
      status: doc.status ?? 'in_stock',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.inventoryItem.create({ data })
  );
}

// ============================================================================
// Notification / PushSubscription / AuditLog / SupportRequest / BackupRecord /
// PaypalOrder / Survey / Settings / MedicalRepresentativeVisit
// ============================================================================

export async function migrateNotifications(): Promise<number> {
  const cursor = models.Notification.find().lean().cursor();
  return runMigration(
    'Notification',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Notification', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      userId: await reqRef('User', doc.user ?? doc.userId, 'Notification'),
      type: doc.type,
      priority: doc.priority ?? 'normal',
      title: doc.title,
      message: doc.message,
      relatedEntityType: doc.relatedEntity?.type ?? undefined,
      relatedEntityId: idStr(doc.relatedEntity?.id) ?? undefined,
      actionUrl: doc.actionUrl ?? undefined,
      read: doc.read ?? false,
      readAt: doc.readAt ?? undefined,
      metadata: mapToJson(doc.metadata),
      expiresAt: doc.expiresAt ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.notification.create({ data })
  );
}

export async function migratePushSubscriptions(): Promise<number> {
  const cursor = PushSubscriptionModel.find().lean().cursor();
  return runMigration(
    'PushSubscription',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('PushSubscription', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      userId: await reqRef('User', doc.user ?? doc.userId, 'PushSubscription'),
      endpoint: doc.endpoint,
      keysP256dh: doc.keys?.p256dh ?? '',
      keysAuth: doc.keys?.auth ?? '',
      userAgent: doc.userAgent ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.pushSubscription.create({ data })
  );
}

export async function migrateAuditLogs(): Promise<number> {
  const cursor = models.AuditLog.find().lean().cursor();
  return runMigration(
    'AuditLog',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('AuditLog', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      userId: await reqRef('User', doc.user ?? doc.userId, 'AuditLog'),
      userEmail: doc.userEmail ?? undefined,
      userRole: doc.userRole ?? undefined,
      action: doc.action,
      resource: doc.resource,
      resourceId: idStr(doc.resourceId) ?? undefined,
      ipAddress: doc.ipAddress ?? undefined,
      userAgent: doc.userAgent ?? undefined,
      requestMethod: doc.requestMethod ?? undefined,
      requestPath: doc.requestPath ?? undefined,
      changes: {
        create: asArray(doc.changes).map((c: any) => ({
          field: c.field,
          oldValue: c.oldValue === undefined ? undefined : c.oldValue,
          newValue: c.newValue === undefined ? undefined : c.newValue,
        })),
      },
      description: doc.description ?? undefined,
      metadata: mapToJson(doc.metadata),
      success: doc.success ?? true,
      errorMessage: doc.errorMessage ?? undefined,
      isSensitive: doc.isSensitive ?? false,
      dataSubjectId: await optRef('Patient', doc.dataSubject ?? doc.dataSubjectId),
      timestamp: doc.timestamp ?? new Date(),
      createdAt: doc.createdAt ?? new Date(),
    }),
    (data) => prisma.auditLog.create({ data })
  );
}

export async function migrateSupportRequests(): Promise<number> {
  const cursor = models.SupportRequest?.find().lean().cursor();
  if (!cursor) return 0;
  return runMigration(
    'SupportRequest',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('SupportRequest', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      userId: await optRef('User', doc.user ?? doc.userId),
      email: doc.email,
      subject: doc.subject,
      category: doc.category ?? 'general',
      message: doc.message,
      status: doc.status ?? 'open',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.supportRequest.create({ data })
  );
}

export async function migrateBackupRecords(): Promise<number> {
  const BackupRecordModel = (models as any).BackupRecord;
  if (!BackupRecordModel) return 0;
  const cursor = BackupRecordModel.find().lean().cursor();
  return runMigration(
    'BackupRecord',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('BackupRecord', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      createdById: await reqRef('User', doc.createdBy ?? doc.createdById, 'BackupRecord'),
      createdByEmail: doc.createdByEmail ?? undefined,
      label: doc.label ?? undefined,
      status: doc.status ?? 'pending',
      collections: asArray(doc.collections),
      totalDocuments: doc.totalDocuments ?? 0,
      sizeBytes: doc.sizeBytes ?? 0,
      version: doc.version ?? '1.0',
      data: doc.data ?? {},
      errorMessage: doc.errorMessage ?? undefined,
      restoredAt: doc.restoredAt ?? undefined,
      restoredById: await optRef('User', doc.restoredBy ?? doc.restoredById),
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.backupRecord.create({ data })
  );
}

export async function migratePaypalOrders(): Promise<number> {
  const PaypalOrderModel = (models as any).PaypalOrder;
  if (!PaypalOrderModel) return 0;
  const cursor = PaypalOrderModel.find().lean().cursor();
  return runMigration(
    'PaypalOrder',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('PaypalOrder', idStr(doc._id)!),
      orderId: doc.orderId,
      tenantId: await reqRef('Tenant', doc.tenantId, 'PaypalOrder'),
      plan: doc.plan,
      billingCycle: doc.billingCycle,
      amount: doc.amount,
      currency: doc.currency ?? 'USD',
      status: doc.status ?? 'pending',
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.paypalOrder.create({ data })
  );
}

export async function migrateSurveys(): Promise<number> {
  const SurveyModel = (models as any).Survey ?? (models as any).SurveyResponse;
  if (!SurveyModel) return 0;
  const cursor = SurveyModel.find().lean().cursor();
  return runMigration(
    'SurveyResponse',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('SurveyResponse', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      visitId: await reqRef('Visit', doc.visit ?? doc.visitId, 'SurveyResponse'),
      patientId: await optRef('Patient', doc.patient ?? doc.patientId),
      overallRating: doc.overallRating,
      doctorRating: doc.doctorRating ?? undefined,
      staffRating: doc.staffRating ?? undefined,
      facilityRating: doc.facilityRating ?? undefined,
      waitTimeRating: doc.waitTimeRating ?? undefined,
      comments: doc.comments ?? undefined,
      wouldRecommend: doc.wouldRecommend ?? undefined,
      submittedAt: doc.submittedAt ?? new Date(),
      ipAddress: doc.ipAddress ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.surveyResponse.create({ data })
  );
}

export async function migrateSettings(): Promise<number> {
  const cursor = models.Settings.find().lean().cursor();
  return runMigration(
    'Settings',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('Settings', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      clinicName: doc.clinicName ?? 'MyClinicSoft',
      clinicAddress: doc.clinicAddress ?? '',
      clinicPhone: doc.clinicPhone ?? '',
      clinicEmail: doc.clinicEmail ?? '',
      clinicWebsite: doc.clinicWebsite ?? '',
      taxId: doc.taxId ?? '',
      licenseNumber: doc.licenseNumber ?? '',
      ptr: doc.ptr ?? '',
      businessHours: {
        create: asArray(doc.businessHours).map((b: any) => ({
          day: b.day,
          open: b.open,
          close: b.close,
          closed: b.closed ?? false,
        })),
      },
      apptDefaultDuration: doc.appointmentSettings?.defaultDuration ?? 30,
      apptReminderHoursBefore: asArray(doc.appointmentSettings?.reminderHoursBefore ?? [24, 2]),
      apptAllowOnlineBooking: doc.appointmentSettings?.allowOnlineBooking ?? true,
      apptRequireConfirmation: doc.appointmentSettings?.requireConfirmation ?? false,
      apptMaxAdvanceBookingDays: doc.appointmentSettings?.maxAdvanceBookingDays ?? 90,
      apptMinAdvanceBookingHours: doc.appointmentSettings?.minAdvanceBookingHours ?? 2,
      commSmsEnabled: doc.communicationSettings?.smsEnabled ?? false,
      commEmailEnabled: doc.communicationSettings?.emailEnabled ?? false,
      commAppointmentReminders: doc.communicationSettings?.appointmentReminders ?? true,
      commLabResultNotifications: doc.communicationSettings?.labResultNotifications ?? true,
      commInvoiceReminders: doc.communicationSettings?.invoiceReminders ?? true,
      billingCurrency: doc.billingSettings?.currency ?? 'PHP',
      billingTaxRate: doc.billingSettings?.taxRate ?? 0,
      billingPaymentTerms: doc.billingSettings?.paymentTerms ?? 30,
      billingLateFeePercentage: doc.billingSettings?.lateFeePercentage ?? 0,
      billingInvoicePrefix: doc.billingSettings?.invoicePrefix ?? 'INV',
      billingAllowPartialPayments: doc.billingSettings?.allowPartialPayments ?? true,
      queueEnable: doc.queueSettings?.enable ?? true,
      queueAutoAssignRooms: doc.queueSettings?.autoAssignRooms ?? false,
      queueEstimatedWaitTimeMinutes: doc.queueSettings?.estimatedWaitTimeMinutes ?? 15,
      queueDisplayPublicly: doc.queueSettings?.displayPublicly ?? false,
      generalTimezone: doc.generalSettings?.timezone ?? 'UTC',
      generalDateFormat: doc.generalSettings?.dateFormat ?? 'MM/DD/YYYY',
      generalTimeFormat: doc.generalSettings?.timeFormat ?? 'h12',
      generalItemsPerPage: doc.generalSettings?.itemsPerPage ?? 20,
      generalEnableAuditLog: doc.generalSettings?.enableAuditLog ?? true,
      generalSessionTimeoutMinutes: doc.generalSettings?.sessionTimeoutMinutes ?? 480,
      integrationCloudinaryEnabled: doc.integrationSettings?.cloudinaryEnabled ?? false,
      integrationTwilioEnabled: doc.integrationSettings?.twilioEnabled ?? false,
      integrationSmtpEnabled: doc.integrationSettings?.smtpEnabled ?? false,
      // automationSettings: flattened boolean struct; default true for anything not present,
      // matching Mongoose defaults (see MIGRATION_NOTES.md).
      autoInvoiceGeneration: doc.automationSettings?.invoiceGeneration ?? true,
      autoPaymentReminders: doc.automationSettings?.paymentReminders ?? true,
      autoLowStockAlerts: doc.automationSettings?.lowStockAlerts ?? true,
      autoLabNotifications: doc.automationSettings?.labNotifications ?? true,
      autoExpiryMonitoring: doc.automationSettings?.expiryMonitoring ?? true,
      autoAppointmentConfirmation: doc.automationSettings?.appointmentConfirmation ?? true,
      autoPrescriptionRefills: doc.automationSettings?.prescriptionRefills ?? true,
      autoFollowupScheduling: doc.automationSettings?.followupScheduling ?? true,
      autoDailyReports: doc.automationSettings?.dailyReports ?? true,
      autoWelcomeMessages: doc.automationSettings?.welcomeMessages ?? true,
      autoVisitSummaries: doc.automationSettings?.visitSummaries ?? true,
      autoNoShowHandling: doc.automationSettings?.noShowHandling ?? true,
      autoWaitlistManagement: doc.automationSettings?.waitlistManagement ?? true,
      autoBirthdayGreetings: doc.automationSettings?.birthdayGreetings ?? true,
      autoHealthReminders: doc.automationSettings?.healthReminders ?? true,
      autoFeedbackCollection: doc.automationSettings?.feedbackCollection ?? true,
      autoRecurringAppointments: doc.automationSettings?.recurringAppointments ?? true,
      autoMedicationAdherence: doc.automationSettings?.medicationAdherence ?? true,
      autoBroadcastMessaging: doc.automationSettings?.broadcastMessaging ?? true,
      autoPeriodicReports: doc.automationSettings?.periodicReports ?? true,
      autoStaffPerformanceReports: doc.automationSettings?.staffPerformanceReports ?? true,
      autoInsuranceVerification: doc.automationSettings?.insuranceVerification ?? true,
      autoQueueOptimization: doc.automationSettings?.queueOptimization ?? true,
      autoDataRetention: doc.automationSettings?.dataRetention ?? true,
      autoSmartAssignment: doc.automationSettings?.smartAssignment ?? true,
      autoInventoryReordering: doc.automationSettings?.inventoryReordering ?? true,
      autoPrescriptionExpiryWarnings: doc.automationSettings?.prescriptionExpiryWarnings ?? true,
      autoDocumentExpiryTracking: doc.automationSettings?.documentExpiryTracking ?? true,
      autoCancellationPolicies: doc.automationSettings?.cancellationPolicies ?? true,
      displayTheme: doc.displaySettings?.theme ?? 'light',
      displaySidebarCollapsed: doc.displaySettings?.sidebarCollapsed ?? true,
      displayShowNotifications: doc.displaySettings?.showNotifications ?? true,
      prescriptionDigitalSignatureEnabled: doc.prescriptionDigitalSignatureEnabled ?? true,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.settings.create({ data })
  );
}

export async function migrateMedicalRepresentativeVisits(): Promise<number> {
  const cursor = models.MedicalRepresentativeVisit.find().lean().cursor();
  return runMigration(
    'MedicalRepresentativeVisit',
    cursor,
    async (doc: any) => ({
      id: await getOrCreateId('MedicalRepresentativeVisit', idStr(doc._id)!),
      tenantId: await optRef('Tenant', doc.tenantId),
      userId: await reqRef('User', doc.user ?? doc.userId, 'MedicalRepresentativeVisit'),
      medicalRepresentativeId: await optRef(
        'MedicalRepresentative',
        doc.medicalRepresentative ?? doc.medicalRepresentativeId
      ),
      clinicName: doc.clinicName,
      clinicLocation: doc.clinicLocation,
      purpose: doc.purpose,
      date: doc.date,
      time: doc.time,
      duration: doc.duration ?? 60,
      status: doc.status ?? 'scheduled',
      notes: doc.notes ?? undefined,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    }),
    (data) => prisma.medicalRepresentativeVisit.create({ data })
  );
}

// ============================================================================
// Orchestration
// ============================================================================

// name -> function, in FK-dependency order. Matches prisma/schema.prisma's
// relation graph — later collections reference earlier ones by their
// already-migrated Postgres UUIDs (via id-map.ts).
const MIGRATIONS: [string, () => Promise<number>][] = [
  ['Tenant', migrateTenants],
  ['Specialization', migrateSpecializations],
  ['Room', migrateRooms],
  ['Service', migrateServices],
  ['Medicine', migrateMedicines],
  ['Role', migrateRoles],
  ['Permission', migratePermissions],
  ['Staff', migrateStaff],
  ['Admin', migrateAdmins],
  ['Doctor', migrateDoctors],
  ['Nurse', migrateNurses],
  ['Receptionist', migrateReceptionists],
  ['Accountant', migrateAccountants],
  ['MedicalRepresentative', migrateMedicalRepresentatives],
  ['User', migrateUsers],
  ['PermissionUserLinks', migratePermissionUserLinks],
  ['Product', migrateProducts], // depends on User + MedicalRepresentative
  ['Patient', migratePatients],
  ['PatientNote', migratePatientNotes],
  ['Appointment', migrateAppointments],
  ['Visit', migrateVisits],
  ['Prescription', migratePrescriptions],
  ['LabResult', migrateLabResults],
  ['Imaging', migrateImaging],
  ['Procedure', migrateProcedures],
  ['Invoice', migrateInvoices],
  ['Referral', migrateReferrals],
  ['Queue', migrateQueues],
  ['Document', migrateDocuments],
  ['Membership', migrateMemberships],
  ['Inventory', migrateInventory],
  ['Notification', migrateNotifications],
  ['PushSubscription', migratePushSubscriptions],
  ['AuditLog', migrateAuditLogs],
  ['SupportRequest', migrateSupportRequests],
  ['BackupRecord', migrateBackupRecords],
  ['PaypalOrder', migratePaypalOrders],
  ['SurveyResponse', migrateSurveys],
  ['Settings', migrateSettings],
  ['MedicalRepresentativeVisit', migrateMedicalRepresentativeVisits],
];

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.split('=')[1] : undefined;

  console.log('[migrate] Connecting to MongoDB...');
  await connectDB();
  console.log('[migrate] Connected to MongoDB.');

  await runAsSystem(() => ensureIdMapTable());

  const toRun = only ? MIGRATIONS.filter(([name]) => name === only) : MIGRATIONS;
  if (only && toRun.length === 0) {
    throw new Error(`[migrate] --only=${only} did not match any known collection. Known: ${MIGRATIONS.map(([n]) => n).join(', ')}`);
  }

  for (const [name, fn] of toRun) {
    console.log(`\n[migrate] ===== ${name} =====`);
    await fn();
  }

  console.log('\n[migrate] All requested migrations complete.');
}

// Only auto-run when this file is executed directly (not when imported by dry-run.ts).
if (require.main === module) {
  main()
    .then(async () => {
      await mongoose.connection.close();
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[migrate] FATAL:', err);
      await mongoose.connection.close().catch(() => {});
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    });
}
