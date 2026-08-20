/**
 * Phase 3 post-migration reconciliation.
 *
 * Run with: tsx scripts/migrate-to-postgres/validate.ts
 *
 * Three checks, in order:
 *   1. Row-count comparison (Mongo Model.countDocuments() vs Postgres count())
 *      for every top-level collection, noting known 1:N splits.
 *   2. _migration_id_map row-count-per-collection sanity check (a re-check
 *      that every migrated Mongo doc has exactly one mapping row — Postgres
 *      itself enforces FK integrity at write time, so a migrate.ts run that
 *      completed without throwing already implies no orphaned FKs).
 *   3. Sampled deep-diff: 20 random migrated docs per major collection,
 *      re-fetched from both sides, key fields compared.
 *
 * Prints a final PASS/FAIL summary and exits non-zero on any failure.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import mongoose, { Types } from 'mongoose';
import connectDB from '../../lib/mongodb';
import { prisma } from '../../lib/prisma';
import { runAsSystem } from '../../lib/tenant-context';
import { countMappings, sampleMappings } from './id-map';
import * as models from '../../models';
import PatientNoteModel from '../../models/PatientNote';

const SAMPLE_SIZE = 20;

type Failure = { check: string; detail: string };
const failures: Failure[] = [];
const warnings: string[] = [];

function fail(check: string, detail: string) {
  failures.push({ check, detail });
  console.error(`  ✗ ${check}: ${detail}`);
}

function ok(check: string) {
  console.log(`  ✓ ${check}`);
}

function idStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Types.ObjectId) return v.toString();
  if (typeof v === 'string') return v;
  const anyV = v as any;
  if (anyV._id) return idStr(anyV._id);
  return String(v);
}

// ============================================================================
// Check 1: row-count comparison
// ============================================================================

// Collections where Mongo count() should match Postgres count() 1:1 (no split).
// [displayName, mongoModel, prismaCountFn]
const ONE_TO_ONE_COLLECTIONS: [string, any, () => Promise<number>][] = [
  ['Tenant', models.Tenant, () => prisma.tenant.count()],
  ['Specialization', models.Specialization, () => prisma.specialization.count()],
  ['Room', models.Room, () => prisma.room.count()],
  ['Service', models.Service, () => prisma.service.count()],
  ['Medicine', models.Medicine, () => prisma.medicine.count()],
  ['Role', models.Role, () => prisma.role.count()],
  ['Permission', models.Permission, () => prisma.permission.count()],
  ['Staff', models.Staff, () => prisma.staff.count()],
  ['Admin', models.Admin, () => prisma.admin.count()],
  ['Doctor', models.Doctor, () => prisma.doctor.count()],
  ['Nurse', models.Nurse, () => prisma.nurse.count()],
  ['Receptionist', models.Receptionist, () => prisma.receptionist.count()],
  ['Accountant', models.Accountant, () => prisma.accountant.count()],
  ['MedicalRepresentative', models.MedicalRepresentative, () => prisma.medicalRepresentative.count()],
  ['User', models.User, () => prisma.user.count()],
  ['Product', models.Product, () => prisma.product.count()],
  ['Patient', models.Patient, () => prisma.patient.count()],
  ['PatientNote', PatientNoteModel, () => prisma.patientNote.count()],
  ['Appointment', models.Appointment, () => prisma.appointment.count()],
  ['Visit', models.Visit, () => prisma.visit.count()],
  // Prescription, LabResult, Imaging, Procedure: 1 Mongo doc -> 1 Prisma parent row
  // (embedded arrays split into child tables, not multiplying the parent count).
  ['Prescription', models.Prescription, () => prisma.prescription.count()],
  ['LabResult', models.LabResult, () => prisma.labResult.count()],
  ['Imaging', models.Imaging, () => prisma.imaging.count()],
  ['Procedure', models.Procedure, () => prisma.procedure.count()],
  // Invoice: 1 Mongo doc (with N embedded BillingItems) -> 1 Prisma Invoice row.
  // Line-item counts are NOT expected to match invoice counts — see note below.
  ['Invoice', models.Invoice, () => prisma.invoice.count()],
  ['Referral', models.Referral, () => prisma.referral.count()],
  ['Queue', models.Queue, () => prisma.queue.count()],
  ['Document', models.Document, () => prisma.document.count()],
  ['Membership', models.Membership, () => prisma.membership.count()],
  ['InventoryItem', models.InventoryItem, () => prisma.inventoryItem.count()],
  ['Notification', models.Notification, () => prisma.notification.count()],
  ['AuditLog', models.AuditLog, () => prisma.auditLog.count()],
  ['Settings', models.Settings, () => prisma.settings.count()],
];

// Optional models that may not exist in every checkout of models/index.ts.
const OPTIONAL_COLLECTIONS: [string, string, () => Promise<number>][] = [
  ['PushSubscription', 'PushSubscription', () => prisma.pushSubscription.count()],
  ['SupportRequest', 'SupportRequest', () => prisma.supportRequest.count()],
  ['BackupRecord', 'BackupRecord', () => prisma.backupRecord.count()],
  ['PaypalOrder', 'PaypalOrder', () => prisma.paypalOrder.count()],
  ['SurveyResponse', 'Survey', () => prisma.surveyResponse.count()],
  ['MedicalRepresentativeVisit', 'MedicalRepresentativeVisit', () => prisma.medicalRepresentativeVisit.count()],
];

async function checkRowCounts(): Promise<void> {
  console.log('\n[validate] === Check 1: row-count comparison ===');

  for (const [name, mongoModel, prismaCount] of ONE_TO_ONE_COLLECTIONS) {
    const mongoCount = await mongoModel.countDocuments();
    const pgCount = await runAsSystem(prismaCount);
    if (mongoCount === pgCount) {
      ok(`${name}: ${mongoCount} == ${pgCount}`);
    } else {
      fail(`${name} row count`, `Mongo=${mongoCount} Postgres=${pgCount} (mismatch)`);
    }
  }

  for (const [name, mongoKey, prismaCount] of OPTIONAL_COLLECTIONS) {
    const mongoModel = (models as any)[mongoKey];
    if (!mongoModel) {
      warnings.push(`${name}: no Mongoose model found under models.${mongoKey} — skipped`);
      continue;
    }
    const mongoCount = await mongoModel.countDocuments();
    const pgCount = await runAsSystem(prismaCount);
    if (mongoCount === pgCount) {
      ok(`${name}: ${mongoCount} == ${pgCount}`);
    } else {
      fail(`${name} row count`, `Mongo=${mongoCount} Postgres=${pgCount} (mismatch)`);
    }
  }

  // Known 1:N splits — informational only, not pass/fail (child counts naturally
  // differ from parent counts; we just report them for a human sanity read).
  console.log('\n[validate] Known 1:N split counts (informational, not compared):');
  const lineItems = await runAsSystem(() => prisma.invoiceLineItem.count());
  const payments = await runAsSystem(() => prisma.invoicePayment.count());
  const discounts = await runAsSystem(() => prisma.invoiceDiscount.count());
  const medications = await runAsSystem(() => prisma.prescriptionMedication.count());
  const patientAllergies = await runAsSystem(() => prisma.patientAllergy.count());
  console.log(`  InvoiceLineItem: ${lineItems}, InvoicePayment: ${payments}, InvoiceDiscount: ${discounts}`);
  console.log(`  PrescriptionMedication: ${medications}, PatientAllergy: ${patientAllergies}`);
}

// ============================================================================
// Check 2: id-map row-count sanity check
// ============================================================================

async function checkIdMapCounts(): Promise<void> {
  console.log('\n[validate] === Check 2: _migration_id_map sanity check ===');

  for (const [name, mongoModel] of ONE_TO_ONE_COLLECTIONS.map(([n, m]) => [n, m] as [string, any])) {
    const mongoCount = await mongoModel.countDocuments();
    const mapCount = await runAsSystem(() => countMappings(name));
    if (mongoCount === mapCount) {
      ok(`${name}: id-map has ${mapCount} rows (matches Mongo count)`);
    } else {
      fail(`${name} id-map count`, `Mongo=${mongoCount} id-map=${mapCount} (mismatch — some docs may not have migrated)`);
    }
  }
}

// ============================================================================
// Check 3: sampled deep-diff
// ============================================================================

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const aTime = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const bTime = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    return aTime === bTime;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < 1e-6;
  }
  return a === b || (a ?? undefined) === (b ?? undefined);
}

async function deepDiffOne(
  name: string,
  mongoDoc: any,
  pgDoc: any,
  fields: [string, string][] // [mongoPath, pgField]
): Promise<void> {
  for (const [mongoPath, pgField] of fields) {
    const mongoVal = mongoPath.split('.').reduce((o, k) => (o == null ? undefined : o[k]), mongoDoc);
    const pgVal = pgDoc?.[pgField];
    if (!fieldsEqual(mongoVal, pgVal)) {
      fail(
        `${name} deep-diff [${idStr(mongoDoc._id)}]`,
        `field ${mongoPath}/${pgField}: Mongo=${JSON.stringify(mongoVal)} Postgres=${JSON.stringify(pgVal)}`
      );
    }
  }
}

async function checkSampledDeepDiff(): Promise<void> {
  console.log(`\n[validate] === Check 3: sampled deep-diff (${SAMPLE_SIZE} docs per collection) ===`);

  // Patient
  await deepDiffCollection(
    'Patient',
    models.Patient,
    (id) => runAsSystem(() => prisma.patient.findUnique({ where: { id } })),
    [
      ['firstName', 'firstName'],
      ['lastName', 'lastName'],
      ['dateOfBirth', 'dateOfBirth'],
      ['sex', 'sex'],
      ['phone', 'phone'],
      ['patientCode', 'patientCode'],
      ['active', 'active'],
    ]
  );

  // Visit
  await deepDiffCollection(
    'Visit',
    models.Visit,
    (id) => runAsSystem(() => prisma.visit.findUnique({ where: { id } })),
    [
      ['visitCode', 'visitCode'],
      ['date', 'date'],
      ['visitType', 'visitType'],
      ['status', 'status'],
    ]
  );

  // Invoice — amounts/status are the highest-stakes fields to get right.
  await deepDiffCollection(
    'Invoice',
    models.Invoice,
    (id) => runAsSystem(() => prisma.invoice.findUnique({ where: { id } })),
    [
      ['invoiceNumber', 'invoiceNumber'],
      ['subtotal', 'subtotal'],
      ['tax', 'tax'],
      ['total', 'total'],
      ['totalPaid', 'totalPaid'],
      ['outstandingBalance', 'outstandingBalance'],
      ['status', 'status'],
    ]
  );

  // Prescription
  await deepDiffCollection(
    'Prescription',
    models.Prescription,
    (id) => runAsSystem(() => prisma.prescription.findUnique({ where: { id } })),
    [
      ['prescriptionCode', 'prescriptionCode'],
      ['issuedAt', 'issuedAt'],
      ['status', 'status'],
    ]
  );

  // Appointment
  await deepDiffCollection(
    'Appointment',
    models.Appointment,
    (id) => runAsSystem(() => prisma.appointment.findUnique({ where: { id } })),
    [
      ['appointmentCode', 'appointmentCode'],
      ['status', 'status'],
      ['duration', 'duration'],
    ]
  );
}

async function deepDiffCollection(
  name: string,
  mongoModel: any,
  fetchPg: (id: string) => Promise<any> | any,
  fields: [string, string][]
): Promise<void> {
  const samples = await runAsSystem(() => sampleMappings(name, SAMPLE_SIZE));
  if (samples.length === 0) {
    warnings.push(`${name}: no id-map rows to sample — skipped deep-diff`);
    return;
  }

  let checked = 0;
  for (const { mongo_id, postgres_id } of samples) {
    const mongoDoc = await mongoModel.findById(mongo_id).lean();
    if (!mongoDoc) {
      fail(`${name} deep-diff`, `Mongo doc ${mongo_id} no longer exists (sample stale?)`);
      continue;
    }
    const pgDoc = await fetchPg(postgres_id);
    if (!pgDoc) {
      fail(`${name} deep-diff`, `Postgres row ${postgres_id} (mapped from Mongo ${mongo_id}) not found`);
      continue;
    }
    await deepDiffOne(name, mongoDoc, pgDoc, fields);
    checked++;
  }
  console.log(`  ${name}: sampled ${checked}/${samples.length} docs`);
}

// ============================================================================
// main
// ============================================================================

async function main(): Promise<void> {
  console.log('[validate] Connecting to MongoDB...');
  await connectDB();
  console.log('[validate] Connected.');

  await checkRowCounts();
  await checkIdMapCounts();
  await checkSampledDeepDiff();

  console.log('\n' + '='.repeat(72));
  if (warnings.length) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (failures.length === 0) {
    console.log('RESULT: PASS — all checks passed.');
  } else {
    console.log(`RESULT: FAIL — ${failures.length} check(s) failed:`);
    for (const f of failures) console.log(`  - [${f.check}] ${f.detail}`);
  }
  console.log('='.repeat(72));
}

main()
  .then(async () => {
    await mongoose.connection.close();
    await prisma.$disconnect();
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('[validate] FATAL:', err);
    await mongoose.connection.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
