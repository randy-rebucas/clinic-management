/**
 * Ties existing staff-issued eMCR temporary passwords to the clinic that issued them.
 *
 * Before passwordTenantId existed, a temporary password signed in across every clinic. The issuing
 * clinic is recovered from the invite the account redeemed. Accounts with no such invite are only
 * listed: they need a decision, so nothing is guessed.
 *
 *   npx tsx scripts/migrate-emcr-temp-passwords.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-emcr-temp-passwords.ts --apply    # write changes
 *   pnpm prod db:migrate:emcr-temp-passwords --apply          # production
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

  const EmcrAccount = (await import('../models/EmcrAccount')).default as Model<any>;
  const EmcrInvite = (await import('../models/EmcrInvite')).default as Model<any>;

  const accounts = await EmcrAccount.collection
    .find({ passwordSetBy: 'staff', passwordTenantId: { $exists: false } }, { projection: { _id: 1 } })
    .toArray();
  console.log(`staff passwords with no clinic: ${accounts.length}`);

  let tied = 0;
  const unresolved: string[] = [];
  for (const { _id } of accounts) {
    const invite = await EmcrInvite.collection.findOne(
      { usedByAccount: _id },
      { sort: { usedAt: -1 }, projection: { tenantId: 1 } }
    );
    if (!invite) {
      unresolved.push(String(_id));
      continue;
    }
    tied++;
    if (APPLY) {
      await EmcrAccount.collection.updateOne(
        { _id, passwordSetBy: 'staff', passwordTenantId: { $exists: false } },
        { $set: { passwordTenantId: invite.tenantId } }
      );
    }
  }

  console.log(`${APPLY ? 'tied' : 'would tie'} to their clinic: ${tied}`);
  console.log(`no invite found, left unchanged: ${unresolved.length}`);
  for (const id of unresolved) console.log(`  ${id}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
