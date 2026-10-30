/**
 * Marks every open prescription ("To dispense" or partly dispensed) Dispensed by recording a
 * dispense of what is left of each medicine, dated the day the prescription was issued.
 *
 * For clinics whose desk handed the medicines over but never recorded it. Stock is NOT deducted
 * (the counts may already have been corrected by hand). Each dispense carries the note below,
 * so --undo removes exactly these and puts the status back from what remains.
 *
 *   npx tsx scripts/mark-prescriptions-dispensed.ts            # dry run (default): report only
 *   npx tsx scripts/mark-prescriptions-dispensed.ts --apply    # record the dispenses
 *   npx tsx scripts/mark-prescriptions-dispensed.ts --undo     # take them back out (dry run unless --apply)
 *   pnpm prod db:mark-prescriptions-dispensed --apply          # production
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose from 'mongoose';
import { dispensedPerMedication, type DispenseItem } from '../lib/prescription-dispense';

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const NOTE = 'Marked dispensed in bulk: medicines handed over but not recorded (stock not deducted)';
const OPEN = ['active', 'partially-dispensed'];
const BATCH = 500;

type Rx = {
  _id: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  issuedAt?: Date;
  createdAt?: Date;
  medications?: { quantity?: number | null }[];
  pharmacyDispenses?: { items?: DispenseItem[] | null; quantityDispensed?: number | null; notes?: string }[];
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  console.log(`${UNDO ? 'UNDO' : 'MARK DISPENSED'} — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no changes; pass --apply to write)'}`);

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db!;
  const prescriptions = db.collection<Rx>('prescriptions');
  const tenantNames = new Map(
    (await db.collection('tenants').find({}, { projection: { name: 1, displayName: 1 } }).toArray()).map((t) => [String(t._id), t.displayName || t.name])
  );
  const report = async (filter: Record<string, unknown>, what: string) => {
    const rows = await prescriptions
      .aggregate([{ $match: filter }, { $group: { _id: '$tenantId', n: { $sum: 1 }, oldest: { $min: '$issuedAt' }, newest: { $max: '$issuedAt' } } }])
      .toArray();
    let n = 0;
    for (const r of rows) {
      n += r.n;
      console.log(`  ${tenantNames.get(String(r._id)) ?? r._id}: ${r.n} ${what}, issued ${r.oldest?.toISOString().slice(0, 10)} to ${r.newest?.toISOString().slice(0, 10)}`);
    }
    return n;
  };

  if (UNDO) {
    const filter = { 'pharmacyDispenses.notes': NOTE };
    const n = await report(filter, 'prescriptions with a bulk dispense');
    if (!APPLY || !n) return;
    // After removing ours: anything still recorded means partly dispensed, nothing means to dispense.
    const res = await prescriptions.updateMany(filter, [
      { $set: { pharmacyDispenses: { $filter: { input: '$pharmacyDispenses', cond: { $ne: ['$$this.notes', NOTE] } } } } },
      { $set: { status: { $cond: [{ $gt: [{ $size: '$pharmacyDispenses' }, 0] }, 'partially-dispensed', 'active'] }, updatedAt: '$$NOW' } },
    ]);
    console.log(`Removed the bulk dispenses from ${res.modifiedCount} prescriptions.`);
    return;
  }

  const open = { status: { $in: OPEN } };
  const n = await report(open, 'prescriptions to mark dispensed');
  console.log(`Total: ${n}. Stock is not changed.`);
  if (!APPLY || !n) return;

  const targets = await prescriptions.find(open, { projection: { issuedAt: 1, createdAt: 1, medications: 1, pharmacyDispenses: 1 } }).toArray();
  let done = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const res = await prescriptions.bulkWrite(
      targets.slice(i, i + BATCH).map((rx) => {
        const prescribed = (rx.medications ?? []).map((m) => Math.max(0, Number(m.quantity) || 0));
        const already = dispensedPerMedication(prescribed, rx.pharmacyDispenses);
        const items = prescribed
          .map((q, medicationIndex) => ({ medicationIndex, quantity: q - already[medicationIndex] }))
          .filter((it) => it.quantity > 0);
        const count = rx.pharmacyDispenses?.length ?? 0;
        return {
          updateOne: {
            // Unchanged since it was read: still open, no dispense recorded meanwhile.
            filter: { _id: rx._id, ...open, [`pharmacyDispenses.${count}`]: { $exists: false } },
            update: {
              $push: {
                pharmacyDispenses: {
                  dispensedAt: rx.issuedAt ?? rx.createdAt ?? new Date(),
                  dispensedBy: 'Bulk update',
                  quantityDispensed: items.reduce((s, it) => s + it.quantity, 0),
                  items,
                  notes: NOTE,
                },
              },
              $set: { status: 'dispensed', updatedAt: new Date() },
            },
          },
        };
      }),
      { ordered: false }
    );
    done += res.modifiedCount;
    console.log(`  ${Math.min(i + BATCH, targets.length)} / ${targets.length}`);
  }
  const left = await prescriptions.countDocuments(open);
  console.log(`Marked ${done} prescriptions dispensed. Still open: ${left}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
