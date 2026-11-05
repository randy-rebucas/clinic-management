/**
 * Turns communicationSettings.smsEnabled on for every clinic, before anything enforces it.
 *
 * The Settings model used to default smsEnabled to false and no screen offered it, so the stored
 * false was never anyone's choice; texts were going out regardless.
 *
 *   npx tsx scripts/migrate-sms-enabled.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-sms-enabled.ts --apply    # write changes
 *   pnpm prod db:migrate:sms-enabled --apply          # production
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Model } from 'mongoose';

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (writing changes)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

  const Settings = (await import('../models/Settings')).default as Model<any>;
  const coll = Settings.collection;
  const filter = { 'communicationSettings.smsEnabled': { $ne: true } };
  const count = await coll.countDocuments(filter);

  console.log(`settings with smsEnabled not true: ${count} -> true`);

  if (APPLY && count > 0) {
    const res = await coll.updateMany(filter, { $set: { 'communicationSettings.smsEnabled': true } });
    console.log(`updated ${res.modifiedCount}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
