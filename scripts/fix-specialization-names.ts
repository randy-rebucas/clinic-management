/**
 * Repairs specialties whose name is another specialty's id.
 *
 * Until Oct 2026 an older doctor form could send the specialty's id in the name field; the API
 * stored that id as the name of a new specialty, and each later save of the doctor nested it once
 * more (Pediatrics ← "697b…" ← "698d…" ← "698f…"). The roster then showed the id as the specialty.
 *
 * For each specialty named by an id, this follows the chain to the real specialty, points the
 * doctors that use it there, and deletes it. A chain that leads nowhere is reported and left alone.
 * Specialties are global (shared by every clinic), so this covers all of them.
 *
 *   npx tsx scripts/fix-specialization-names.ts            # dry run (default): report only
 *   npx tsx scripts/fix-specialization-names.ts --apply    # repoint doctors, delete the bogus ones
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const OBJECT_ID = /^[a-f0-9]{24}$/i;

type Spec = { _id: Types.ObjectId; name: string };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (repointing doctors, deleting bogus specialties)' : 'MODE: DRY RUN (no changes; pass --apply to fix)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db!;
  const specs = db.collection<Spec>('specializations');
  const doctors = db.collection('doctors');

  const bogus = await specs.find({ name: { $regex: OBJECT_ID } }, { projection: { name: 1 } }).toArray();
  console.log(`specialties named by an id: ${bogus.length}`);

  // Every chain is followed before anything is deleted: removing one link would break the others.
  const plan: { spec: Spec; target: Spec; using: number }[] = [];
  for (const spec of bogus) {
    let target: Spec | null = spec;
    const seen = new Set<string>();
    while (target && OBJECT_ID.test(target.name) && !seen.has(String(target._id))) {
      seen.add(String(target._id));
      target = await specs.findOne({ _id: new Types.ObjectId(target.name) }, { projection: { name: 1 } });
    }
    const using = await doctors.countDocuments({ specializationId: spec._id });
    if (!target || OBJECT_ID.test(target.name)) {
      console.log(`  ${spec._id} "${spec.name}": leads nowhere, left alone (${using} doctor(s))`);
      continue;
    }
    console.log(`  ${spec._id} "${spec.name}" → ${target._id} "${target.name}" (${using} doctor(s))`);
    plan.push({ spec, target, using });
  }

  if (!APPLY) return mongoose.disconnect();
  for (const { spec, target, using } of plan) {
    if (using) {
      const res = await doctors.updateMany({ specializationId: spec._id }, { $set: { specializationId: target._id } });
      console.log(`    repointed ${res.modifiedCount} doctor(s)`);
    }
    await specs.deleteOne({ _id: spec._id });
    console.log('    deleted');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
