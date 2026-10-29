/**
 * Deletes notifications addressed to someone who is not a User.
 *
 * Until Oct 2026 the reminder automations put a patient's id in Notification.user. Patients have
 * no User account, and their app builds its feed from clinical records, so those notifications
 * could never be shown to anyone; they only took space. Staff and medical-rep notifications
 * (user is a real User) are kept.
 *
 *   npx tsx scripts/cleanup-orphan-notifications.ts            # dry run (default): report only
 *   npx tsx scripts/cleanup-orphan-notifications.ts --apply    # delete them
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const BATCH = 5000;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (deleting)' : 'MODE: DRY RUN (no changes; pass --apply to delete)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db!;
  const notifications = db.collection('notifications');

  const userIds = await db.collection('users').distinct('_id');
  const orphan = { user: { $nin: userIds } };
  const total = await notifications.countDocuments({});
  const orphans = await notifications.countDocuments(orphan);
  console.log(`notifications: ${total}, addressed to a non-user: ${orphans}, kept: ${total - orphans}`);

  const byTitle = await notifications
    .aggregate([{ $match: orphan }, { $group: { _id: '$title', n: { $sum: 1 } } }, { $sort: { n: -1 } }])
    .toArray();
  for (const t of byTitle) console.log(`  ${String(t.n).padStart(7)}  ${t._id}`);

  if (APPLY && orphans > 0) {
    // In batches, so a free-tier cluster isn't asked for one huge delete.
    let deleted = 0;
    for (;;) {
      const ids = (await notifications.find(orphan, { projection: { _id: 1 } }).limit(BATCH).toArray()).map((d) => d._id);
      if (!ids.length) break;
      const res = await notifications.deleteMany({ _id: { $in: ids }, ...orphan });
      deleted += res.deletedCount;
      console.log(`  deleted ${deleted}/${orphans}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
