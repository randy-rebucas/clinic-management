/**
 * Gives existing lab requests an order code, grouping the tests that were ordered together.
 *
 * Before lab orders existed, the order form saved each test on its own (LAB-000001, LAB-000002, …),
 * so CBC, Urinalysis and FBS ordered in one go showed as three separate rows. This finds those
 * tests and gives them one shared orderCode, so they list, print and alert the lab as one order.
 *
 * Tests count as one order when they share clinic, patient, visit and ordering doctor, were ordered
 * within 2 minutes of the previous one, and carry the same shared details (urgency, fasting,
 * instructions, preparation, outside lab). The order's code is the group's lowest request code.
 * Request codes themselves are NOT changed, and grouped tests keep printing (and sealing) one form
 * per test (lib/lab-orders.ts placedAsOrder), so forms printed before stay valid.
 * A test ordered on its own gets orderCode = its requestCode.
 *
 *   npx tsx scripts/migrate-lab-order-codes.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-lab-order-codes.ts --apply    # write changes
 *   pnpm prod db:migrate:lab-order-codes --apply          # production
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Model } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const WINDOW_MS = 2 * 60 * 1000;
const SAMPLE = 15;

interface Lab {
  _id: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  patient?: mongoose.Types.ObjectId;
  visit?: mongoose.Types.ObjectId;
  orderedBy?: mongoose.Types.ObjectId;
  orderDate?: Date;
  createdAt?: Date;
  requestCode?: string;
  request?: { testType?: string; urgency?: string; fastingRequired?: boolean; specialInstructions?: string; preparationNotes?: string };
  thirdPartyLab?: { labName?: string };
}

const seqOf = (code?: string) => {
  const m = String(code ?? '').match(/^LAB-(\d+)/i);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};

/** Everything that must match for two tests to belong to one order (time aside). */
const sameOrderKey = (l: Lab) =>
  JSON.stringify([
    String(l.tenantId ?? ''),
    String(l.patient ?? ''),
    String(l.visit ?? ''),
    String(l.orderedBy ?? ''),
    l.request?.urgency ?? 'routine',
    Boolean(l.request?.fastingRequired),
    (l.request?.specialInstructions ?? '').trim(),
    (l.request?.preparationNotes ?? '').trim(),
    (l.thirdPartyLab?.labName ?? '').trim(),
  ]);

const at = (l: Lab) => new Date(l.orderDate ?? l.createdAt ?? 0).getTime();

/** The group's order code: its lowest request code, without a test suffix (LAB-000004-1 → LAB-000004). */
const orderCodeOf = (g: Lab[]) => {
  const lowest = [...g].sort((a, b) => seqOf(a.requestCode) - seqOf(b.requestCode) || String(a.requestCode).localeCompare(String(b.requestCode), undefined, { numeric: true }))[0].requestCode!;
  return lowest.match(/^(LAB-\d+)-\d+$/i)?.[1] ?? lowest;
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (writing changes)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

  const LabResult = (await import('../models/LabResult')).default as Model<any>;
  const coll = LabResult.collection;

  const labs = (await coll
    .find(
      { orderCode: { $not: { $type: 'string' } }, requestCode: { $type: 'string' } },
      {
        projection: {
          tenantId: 1, patient: 1, visit: 1, orderedBy: 1, orderDate: 1, createdAt: 1, requestCode: 1,
          'request.testType': 1, 'request.urgency': 1, 'request.fastingRequired': 1,
          'request.specialInstructions': 1, 'request.preparationNotes': 1, 'thirdPartyLab.labName': 1,
        },
      }
    )
    .toArray()) as unknown as Lab[];
  console.log(`lab requests without an order code: ${labs.length}`);

  // Bucket by everything but time, then split each bucket where the gap exceeds the window.
  const buckets = new Map<string, Lab[]>();
  for (const l of labs) {
    const k = sameOrderKey(l);
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(l);
  }
  const groups: Lab[][] = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => at(a) - at(b) || seqOf(a.requestCode) - seqOf(b.requestCode));
    let current: Lab[] = [];
    for (const l of bucket) {
      if (current.length && at(l) - at(current[current.length - 1]) > WINDOW_MS) {
        groups.push(current);
        current = [];
      }
      current.push(l);
    }
    if (current.length) groups.push(current);
  }

  const multi = groups.filter((g) => g.length > 1);
  console.log(`orders found: ${groups.length} (${multi.length} with several tests, ${groups.length - multi.length} single tests)`);
  for (const g of multi.slice(0, SAMPLE)) {
    const code = orderCodeOf(g);
    console.log(
      `  ${code}: ${g.map((l) => `${l.requestCode} ${l.request?.testType ?? '?'}`).join(', ')}` +
        ` · ${new Date(at(g[0])).toISOString()}`
    );
  }
  if (multi.length > SAMPLE) console.log(`  … and ${multi.length - SAMPLE} more`);

  if (!APPLY) {
    console.log('dry run: nothing written');
    return;
  }

  const ops = groups.map((g) => {
    const code = orderCodeOf(g);
    return {
      updateMany: {
        filter: { _id: { $in: g.map((l) => l._id) }, orderCode: { $not: { $type: 'string' } } },
        update: { $set: { orderCode: code } },
      },
    };
  });
  let modified = 0;
  for (let i = 0; i < ops.length; i += 500) {
    const res = await coll.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    modified += res.modifiedCount;
  }
  console.log(`updated ${modified} lab requests`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
