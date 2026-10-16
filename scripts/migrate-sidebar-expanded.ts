/**
 * Resets settings.displaySettings.sidebarCollapsed to false (expanded) for every tenant.
 *
 * The Settings model used to default sidebarCollapsed to true, so most stored settings say "collapsed"
 * even though nobody chose it — and the stored value overrides the app's expanded default.
 *
 *   npx tsx scripts/migrate-sidebar-expanded.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-sidebar-expanded.ts --apply    # write changes
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
  const filter = { 'displaySettings.sidebarCollapsed': { $ne: false } };
  const count = await coll.countDocuments(filter);

  console.log(`settings with sidebarCollapsed not false: ${count} -> false`);

  if (APPLY && count > 0) {
    const res = await coll.updateMany(filter, { $set: { 'displaySettings.sidebarCollapsed': false } });
    console.log(`updated ${res.modifiedCount}`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
