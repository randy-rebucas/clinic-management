/**
 * Marks every open invoice paid by recording a cash payment for its remaining balance, dated
 * the day the invoice was made (so income reports put the money on the day it was billed).
 *
 * For clinics whose desk took the money but never recorded it. Each payment carries the note
 * below, so --undo removes exactly these payments and nothing a person recorded. The write is
 * the same one the payment API makes (lib/invoice-payments.ts): payments, totalPaid,
 * outstandingBalance and status move together. No invoice.paid webhooks are sent.
 *
 *   npx tsx scripts/mark-invoices-paid.ts            # dry run (default): report only
 *   npx tsx scripts/mark-invoices-paid.ts --apply    # record the payments
 *   npx tsx scripts/mark-invoices-paid.ts --undo     # take them back out (dry run unless --apply)
 *   pnpm prod db:mark-invoices-paid --apply            # production
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const NOTE = 'Marked paid in bulk: payment taken at the desk but not recorded';
const OPEN = ['unpaid', 'partial'];
const BATCH = 500;

const paymentsSum = { $round: [{ $sum: { $ifNull: ['$payments.amount', []] } }, 2] };
const totalExpr = { $ifNull: ['$total', 0] };
const outstandingExpr = { $round: [{ $subtract: [totalExpr, paymentsSum] }, 2] };
/** totalPaid, outstandingBalance and status from the payments, as lib/invoice-payments.ts does. */
const recompute = [
  { $set: { totalPaid: paymentsSum } },
  { $set: { outstandingBalance: { $round: [{ $subtract: [totalExpr, '$totalPaid'] }, 2] } } },
  {
    $set: {
      status: {
        $switch: {
          branches: [
            { case: { $lte: ['$outstandingBalance', 0] }, then: 'paid' },
            { case: { $gt: ['$totalPaid', 0] }, then: 'partial' },
          ],
          default: 'unpaid',
        },
      },
      updatedAt: '$$NOW',
    },
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  console.log(`${UNDO ? 'UNDO' : 'MARK PAID'} — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no changes; pass --apply to write)'}`);

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db!;
  const invoices = db.collection('invoices');
  const tenantNames = new Map(
    (await db.collection('tenants').find({}, { projection: { name: 1, displayName: 1 } }).toArray()).map((t) => [String(t._id), t.displayName || t.name])
  );

  if (UNDO) {
    const filter = { 'payments.notes': NOTE };
    const byTenant = await invoices
      .aggregate([{ $match: filter }, { $unwind: '$payments' }, { $match: { 'payments.notes': NOTE } }, { $group: { _id: '$tenantId', n: { $sum: 1 }, amount: { $sum: '$payments.amount' } } }])
      .toArray();
    for (const r of byTenant) console.log(`  ${tenantNames.get(String(r._id)) ?? r._id}: ${r.n} bulk payments, ${r.amount.toFixed(2)}`);
    if (APPLY) {
      const res = await invoices.updateMany(filter, [
        { $set: { payments: { $filter: { input: '$payments', cond: { $ne: ['$$this.notes', NOTE] } } } } },
        ...recompute,
      ]);
      console.log(`Removed the bulk payments from ${res.modifiedCount} invoices.`);
    }
    return;
  }

  // Open, not refunded, with money still owed according to the payments themselves.
  const owing = { status: { $in: OPEN }, $expr: { $gt: [outstandingExpr, 0] } };
  // Open but nothing owed (stale status): only the status is put right, no payment added.
  const stale = { status: { $in: OPEN }, $expr: { $lte: [outstandingExpr, 0] } };

  const byTenant = await invoices
    .aggregate([
      { $match: owing },
      { $group: { _id: '$tenantId', n: { $sum: 1 }, due: { $sum: outstandingExpr }, oldest: { $min: '$createdAt' }, newest: { $max: '$createdAt' } } },
    ])
    .toArray();
  let count = 0;
  let due = 0;
  for (const r of byTenant) {
    count += r.n;
    due += r.due;
    console.log(
      `  ${tenantNames.get(String(r._id)) ?? r._id}: ${r.n} invoices, ${r.due.toFixed(2)} due, billed ${r.oldest?.toISOString().slice(0, 10)} to ${r.newest?.toISOString().slice(0, 10)}`
    );
  }
  const staleCount = await invoices.countDocuments(stale);
  console.log(`Total: ${count} invoices, ${due.toFixed(2)} to record as cash. Open with nothing owed (status fixed only): ${staleCount}.`);
  if (!APPLY) return;

  // One write per invoice, each payment with its own id as the payment API gives it. The filter
  // repeats "still owing", so an invoice paid in the app meanwhile is left alone.
  const targets = await invoices.find(owing, { projection: { _id: 1 } }).toArray();
  let recorded = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const res = await invoices.bulkWrite(
      targets.slice(i, i + BATCH).map((t) => ({
        updateOne: {
          filter: { _id: t._id, ...owing },
          update: [
            {
              $set: {
                payments: {
                  $concatArrays: [
                    { $ifNull: ['$payments', []] },
                    [{ _id: new mongoose.Types.ObjectId(), method: 'cash', amount: outstandingExpr, date: '$createdAt', notes: NOTE }],
                  ],
                },
              },
            },
            ...recompute,
          ],
        },
      })),
      { ordered: false }
    );
    recorded += res.modifiedCount;
    console.log(`  ${Math.min(i + BATCH, targets.length)} / ${targets.length}`);
  }
  const fixed = await invoices.updateMany(stale, recompute);
  const left = await invoices.countDocuments({ status: { $in: OPEN } });
  console.log(`Recorded payments on ${recorded} invoices; fixed the status of ${fixed.modifiedCount}. Still open: ${left}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
