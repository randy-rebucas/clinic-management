/**
 * 2026-10 audit migration: index fixes + settings defaults.
 *
 * Run BEFORE deploying the new code (otherwise autoIndex may hit E11000 on the new unique indexes):
 *   npx tsx scripts/migrate-2026-10-audit.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-2026-10-audit.ts --apply    # write changes
 *
 * What it does:
 *  a) drops obsolete global unique indexes (appointmentCode_1, patientCode_1) and other indexes no longer
 *     in the schemas (via syncIndexes)
 *  b) reports duplicates that would block the new unique indexes; a collection with duplicates is NOT
 *     synced (only non-conflicting indexes are created) until the data is fixed
 *  c) syncIndexes() for the changed models (incl. Notification: compound TTL index -> single-field expiresAt_1)
 *  d) sets settings.prescriptionPaperSize = 'A4' where it was never stored
 *
 * Note: the double-booking index uses $in in partialFilterExpression, which requires MongoDB 6.0+.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Model } from 'mongoose';

// Indexes must only be built by this script, after the duplicate checks.
mongoose.set('autoIndex', false);

const APPLY = process.argv.includes('--apply');
const SAMPLE = 10;

/** Global unique indexes that are always safe to drop: per-tenant uniqueness is implied by them. */
const ALWAYS_DROP: Record<string, string[]> = {
  appointments: ['appointmentCode_1'],
  patients: ['patientCode_1'],
};

interface DupCheck {
  label: string;
  keys: Record<string, unknown>;
  match: Record<string, unknown>;
}

const ACTIVE_SLOT_MATCH = {
  status: { $in: ['pending', 'scheduled', 'confirmed', 'rescheduled'] },
  doctor: { $type: 'objectId' },
  appointmentDate: { $type: 'date' },
  appointmentTime: { $type: 'string' },
  isWalkIn: false,
};

const str = (field: string) => ({ [field]: { $type: 'string' } });
const perTenant = (field: string): DupCheck => ({
  label: `tenantId + ${field}`,
  keys: { tenantId: '$tenantId', [field]: `$${field}` },
  match: str(field),
});

async function loadTargets(): Promise<Array<{ model: Model<any>; checks: DupCheck[] }>> {
  const [
    Appointment,
    Patient,
    Membership,
    InventoryItem,
    Invoice,
    Visit,
    Prescription,
    LabResult,
    Referral,
    Queue,
    DocumentModel,
    AuditLog,
    Notification,
  ] = await Promise.all([
    import('../models/Appointment'),
    import('../models/Patient'),
    import('../models/Membership'),
    import('../models/Inventory'),
    import('../models/Invoice'),
    import('../models/Visit'),
    import('../models/Prescription'),
    import('../models/LabResult'),
    import('../models/Referral'),
    import('../models/Queue'),
    import('../models/Document'),
    import('../models/AuditLog'),
    import('../models/Notification'),
  ]).then((mods) => mods.map((m) => m.default as Model<any>));

  return [
    {
      model: Appointment,
      checks: [
        perTenant('appointmentCode'),
        {
          label: 'double-booked active doctor slot (tenantId + doctor + appointmentDate + appointmentTime)',
          keys: {
            tenantId: '$tenantId',
            doctor: '$doctor',
            appointmentDate: '$appointmentDate',
            appointmentTime: '$appointmentTime',
          },
          match: ACTIVE_SLOT_MATCH,
        },
      ],
    },
    {
      model: Patient,
      checks: [{ label: 'patientCode (global)', keys: { patientCode: '$patientCode' }, match: str('patientCode') }],
    },
    {
      model: Membership,
      checks: [
        perTenant('membershipNumber'),
        { label: 'tenantId + patient', keys: { tenantId: '$tenantId', patient: '$patient' }, match: {} },
      ],
    },
    {
      model: InventoryItem,
      checks: [
        {
          label: 'tenantId + sku',
          keys: { tenantId: '$tenantId', sku: '$sku' },
          match: { sku: { $type: 'string', $gt: '' } },
        },
      ],
    },
    { model: Invoice, checks: [perTenant('invoiceNumber')] },
    { model: Visit, checks: [perTenant('visitCode')] },
    { model: Prescription, checks: [perTenant('prescriptionCode')] },
    { model: LabResult, checks: [perTenant('requestCode')] },
    { model: Referral, checks: [perTenant('referralCode')] },
    { model: Queue, checks: [perTenant('queueNumber')] },
    { model: DocumentModel, checks: [perTenant('documentCode')] },
    { model: AuditLog, checks: [] },
    // The compound TTL index (tenantId_1_expiresAt_1) never expired anything; replaced by expiresAt_1.
    { model: Notification, checks: [] },
  ];
}

async function findDuplicates(model: Model<any>, check: DupCheck) {
  return model.collection
    .aggregate(
      [
        { $match: check.match },
        { $group: { _id: check.keys, count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
}

async function existingIndexNames(model: Model<any>): Promise<string[]> {
  try {
    const indexes = await model.collection.indexes();
    return indexes.map((i) => String(i.name));
  } catch (err: any) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) return [];
    throw err;
  }
}

async function processModel(model: Model<any>, checks: DupCheck[]): Promise<boolean> {
  const coll = model.collection.collectionName;
  console.log(`\n=== ${model.modelName} (${coll})`);

  let blocked = false;
  for (const check of checks) {
    const dups = await findDuplicates(model, check);
    if (dups.length === 0) continue;
    blocked = true;
    console.log(`  ! ${dups.length} duplicate group(s) on ${check.label}:`);
    for (const d of dups.slice(0, SAMPLE)) {
      console.log(`      ${JSON.stringify(d._id)} x${d.count} ids=${d.ids.map(String).join(',')}`);
    }
    if (dups.length > SAMPLE) console.log(`      ... ${dups.length - SAMPLE} more`);
  }

  const names = await existingIndexNames(model);
  const forcedDrops = (ALWAYS_DROP[coll] || []).filter((n) => names.includes(n));

  let diff: { toDrop: string[]; toCreate: unknown[] } = { toDrop: [], toCreate: [] };
  if (names.length > 0) {
    const d = await model.diffIndexes();
    diff = { toDrop: d.toDrop as string[], toCreate: d.toCreate as unknown[] };
  }
  console.log(`  indexes to drop:   ${diff.toDrop.length ? diff.toDrop.join(', ') : '(none)'}`);
  console.log(`  indexes to create: ${diff.toCreate.length ? diff.toCreate.map((s) => JSON.stringify(s)).join(' ') : '(none)'}`);

  if (!APPLY) {
    if (blocked) console.log('  -> would NOT sync this collection until the duplicates above are resolved');
    return !blocked;
  }

  for (const name of forcedDrops) {
    await model.collection.dropIndex(name);
    console.log(`  dropped ${name}`);
  }

  if (!blocked) {
    const dropped = await model.syncIndexes();
    console.log(`  synced (dropped: ${dropped.length ? dropped.join(', ') : 'none'})`);
    return true;
  }

  // Duplicates present: build what can be built, keep the old indexes, report the rest.
  console.log('  duplicates present: creating non-conflicting indexes only; obsolete indexes kept');
  for (const [fields, options] of model.schema.indexes()) {
    try {
      await model.collection.createIndex(fields as any, { ...(options as any), background: true });
    } catch (err: any) {
      console.log(`  x could not create ${JSON.stringify(fields)}: ${err?.codeName || err?.code || err?.message}`);
    }
  }
  return false;
}

async function reportUserEmailDuplicates() {
  const users = mongoose.connection.collection('users');
  const dups = await users
    .aggregate(
      [
        { $match: { email: { $type: 'string' } } },
        {
          $group: {
            _id: { tenantId: { $ifNull: ['$tenantId', null] }, email: { $toLower: '$email' } },
            count: { $sum: 1 },
            ids: { $push: '$_id' },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ],
      { allowDiskUse: true }
    )
    .toArray();
  console.log('\n=== User (users): duplicate emails within a tenant (report only)');
  if (dups.length === 0) {
    console.log('  none');
    return true;
  }
  for (const d of dups.slice(0, SAMPLE)) {
    console.log(`  ! ${JSON.stringify(d._id)} x${d.count} ids=${d.ids.map(String).join(',')}`);
  }
  if (dups.length > SAMPLE) console.log(`  ... ${dups.length - SAMPLE} more`);
  return false;
}

async function fixSettings() {
  const Settings = (await import('../models/Settings')).default as Model<any>;
  const coll = Settings.collection;
  const missing = { prescriptionPaperSize: { $exists: false } };
  const missingCount = await coll.countDocuments(missing);
  const a5Count = await coll.countDocuments({ prescriptionPaperSize: 'A5' });

  console.log('\n=== Settings (prescriptionPaperSize)');
  console.log(`  without a stored value: ${missingCount} -> 'A4'`);
  console.log(`  stored 'A5' (left unchanged; could be an explicit choice — review manually): ${a5Count}`);

  if (APPLY && missingCount > 0) {
    const res = await coll.updateMany(missing, { $set: { prescriptionPaperSize: 'A4' } });
    console.log(`  updated ${res.modifiedCount}`);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (writing changes)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

  const targets = await loadTargets();
  const blockedModels: string[] = [];
  for (const { model, checks } of targets) {
    const ok = await processModel(model, checks);
    if (!ok) blockedModels.push(model.modelName);
  }

  const usersOk = await reportUserEmailDuplicates();
  await fixSettings();

  console.log('\n=== Summary');
  if (blockedModels.length) {
    console.log(`  Blocked by duplicates (fix data, then re-run): ${blockedModels.join(', ')}`);
  } else {
    console.log('  No blocking duplicates.');
  }
  if (!usersOk) console.log('  Duplicate user emails found within a tenant (resolve before the users unique index is built).');
  if (!APPLY) console.log('  Dry run only. Re-run with --apply to write.');

  await mongoose.disconnect();
  process.exit(blockedModels.length || !usersOk ? 2 : 0);
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
