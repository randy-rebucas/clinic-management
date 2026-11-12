/**
 * Resets local dev staff logins to DEV_PASSWORD from .env.local, so the password never drifts.
 * Local Docker database only (guard.ts). Also clears 2FA and "must set password".
 *
 *   pnpm db:local:reset-password admin1@my-clinic.dev   # one account
 *   pnpm db:local:reset-password --all                  # every *.dev staff login
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { assertLocalDatabase, describeMongoUri } from './guard';
import { devPassword } from './scrub';

async function main() {
  const uri = assertLocalDatabase(process.env.MONGODB_URI);
  const all = process.argv.includes('--all');
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  if (!all && !email) {
    console.error('Usage: pnpm db:local:reset-password <email> | --all');
    process.exit(1);
  }
  if (!process.env.DEV_PASSWORD) console.warn('⚠️  DEV_PASSWORD is not set in .env.local; using the default "devpassword".');

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  // Raw driver: Mongoose save hooks on users would hash twice or send emails.
  const users = mongoose.connection.db!.collection('users');
  const filter = all ? { email: /\.dev$/i } : { email };
  const hash = await bcrypt.hash(devPassword(), 10);
  const result = await users.updateMany(filter, {
    $set: { password: hash, mustSetPassword: false, status: 'active', isActive: true, totpEnabled: false, revokedSessions: [] },
    $unset: { totpSecret: '', totpPendingSecret: '', inviteTokenHash: '', tempPassword: '' },
  });
  await mongoose.disconnect();

  if (!result.matchedCount) {
    console.error(`❌  No user matched ${all ? '*.dev' : email} in ${describeMongoUri(uri)}.`);
    process.exit(1);
  }
  console.log(`✅  Reset ${result.matchedCount} login(s) in ${describeMongoUri(uri)} to DEV_PASSWORD from .env.local.`);
}

main().catch(async (err) => {
  console.error(`❌  ${err instanceof Error ? err.message : err}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
