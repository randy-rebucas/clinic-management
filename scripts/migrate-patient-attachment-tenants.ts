/**
 * Stamps each patient file with the clinic that uploaded it (attachments[].tenantId).
 *
 * Patient records are shared between clinics, and a file is now shown only to the clinic that
 * uploaded it (lib/patient-attachments.ts). Files from before that have no tenantId and are shown to
 * no one until this runs. Owner, in order:
 *   1. the uploader's clinic (uploadedBy -> users.tenantId), when that clinic is still on the record
 *   2. the record's only clinic, when it has exactly one
 * Anything else is listed and left unassigned for a person to decide.
 *
 *   npx tsx scripts/migrate-patient-attachment-tenants.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-patient-attachment-tenants.ts --apply    # write changes
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');

interface Row {
  _id: Types.ObjectId;
  tenantIds?: Types.ObjectId[];
  attachments?: { _id: Types.ObjectId; uploadedBy?: Types.ObjectId; tenantId?: Types.ObjectId; filename?: string }[];
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (writing changes)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);
  const db = mongoose.connection.db!;
  const patients = db.collection<Row>('patients');
  const users = db.collection<{ _id: Types.ObjectId; tenantId?: Types.ObjectId }>('users');

  const userTenant = new Map<string, string | null>();
  const tenantOfUser = async (id: Types.ObjectId | undefined) => {
    if (!id) return null;
    const key = String(id);
    if (!userTenant.has(key)) {
      const u = await users.findOne({ _id: id }, { projection: { tenantId: 1 } });
      userTenant.set(key, u?.tenantId ? String(u.tenantId) : null);
    }
    return userTenant.get(key) ?? null;
  };

  const cursor = patients.find(
    { attachments: { $elemMatch: { tenantId: { $exists: false } } } },
    { projection: { tenantIds: 1, 'attachments._id': 1, 'attachments.uploadedBy': 1, 'attachments.tenantId': 1, 'attachments.filename': 1 } }
  );

  let byUploader = 0;
  let bySoleClinic = 0;
  const unassigned: string[] = [];
  const ops: mongoose.mongo.AnyBulkWriteOperation<Row>[] = [];

  for await (const p of cursor) {
    const clinics = (p.tenantIds ?? []).map(String);
    for (const a of p.attachments ?? []) {
      if (a.tenantId) continue;
      const uploader = await tenantOfUser(a.uploadedBy);
      let owner: string | null = null;
      if (uploader && clinics.includes(uploader)) {
        owner = uploader;
        byUploader++;
      } else if (clinics.length === 1) {
        owner = clinics[0];
        bySoleClinic++;
      }
      if (!owner) {
        unassigned.push(`patient ${p._id} file ${a._id} (${a.filename ?? 'unnamed'}), clinics: ${clinics.join(', ') || 'none'}`);
        continue;
      }
      ops.push({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { 'attachments.$[a].tenantId': new Types.ObjectId(owner) } },
          arrayFilters: [{ 'a._id': a._id }],
        },
      });
    }
  }

  console.log(`assign by uploader's clinic: ${byUploader}`);
  console.log(`assign to the record's only clinic: ${bySoleClinic}`);
  console.log(`left unassigned: ${unassigned.length}`);
  for (const line of unassigned) console.log(`  ${line}`);

  if (APPLY && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) {
      const res = await patients.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      console.log(`updated ${res.modifiedCount}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
