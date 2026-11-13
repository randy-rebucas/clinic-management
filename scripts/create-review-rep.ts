/**
 * Creates (or refreshes) an activated medical-rep login for App Store / Google Play reviewers of
 * the eMedRoute app. Safe to run again: it resets the password and re-activates the account.
 *
 *   pnpm db:create-review-rep                                   # local database
 *   pnpm prod db:create-review-rep                              # production (asks y/N first)
 *   pnpm prod db:create-review-rep -- --password "<password>"   # choose the password
 *   pnpm prod db:create-review-rep -- --email other@example.com
 *
 * Reviewers can't receive our SMS codes, so the number is left unverified and the account signs
 * in with email + password (shown under "Text me a code" on the sign-in screen). The account is
 * marked paid as complimentary, with a one-year booking subscription, so no screen asks a
 * reviewer to pay.
 *
 * Raw driver on purpose: the model's post-save hook would email a set-password invite.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { describeMongoUri } from './dev-db/guard';
import { STANDARD_ROLE } from '../lib/roles';

const DEFAULT_EMAIL = 'appreview@myclinicsoft.solutions';

/** DEFAULT_ROLE_PERMISSIONS['medical-representative'] in lib/permissions.ts (not importable here: it pulls in React and the models). */
const REP_DEFAULT_PERMISSIONS = [
  { resource: 'doctors', actions: ['read'] },
  { resource: 'patients', actions: ['read'] },
  { resource: 'appointments', actions: ['read'] },
  { resource: 'medicines', actions: ['read'] },
  { resource: 'notifications', actions: ['read', 'update'] },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 16 characters, letters and digits only, so it's easy to paste into the store consoles. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  const email = (arg('email') ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = arg('password') ?? process.env.REVIEW_REP_PASSWORD ?? generatePassword();
  if (password.length < 8) throw new Error('The password must be at least 8 characters.');

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db!;
  const users = db.collection('users');
  const reps = db.collection('medicalrepresentatives');
  const roles = db.collection('roles');

  const tenantless = { $or: [{ tenantId: null }, { tenantId: { $exists: false } }] };
  const now = new Date();

  // The tenant-less rep role, created as the MedicalRepresentative post-save hook would on the
  // first rep sign-up ({tenantId: null} also matches a role without the field).
  const standard = STANDARD_ROLE['medical-representative'];
  const role = await roles.findOneAndUpdate(
    { name: 'medical-representative', tenantId: null },
    {
      $setOnInsert: {
        displayName: standard.displayName,
        description: standard.description,
        level: standard.level,
        isActive: true,
        defaultPermissions: REP_DEFAULT_PERMISSIONS,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  if (!role) throw new Error('Could not find or create the medical-representative role.');

  const oneYear = new Date(now);
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  const hash = await bcrypt.hash(password, 12);

  // A clinic account with this email would be a different login; only the tenant-less one counts.
  const existingUser = await users.findOne({ email, ...tenantless });
  if (existingUser && existingUser.role?.toString() !== role._id.toString()) {
    throw new Error(`${email} already belongs to a non-rep account. Use --email to pick another address.`);
  }

  const repFields = {
    firstName: 'App',
    lastName: 'Reviewer',
    email,
    company: 'MyClinicSoft Demo Pharma',
    territory: 'Metro Manila',
    title: 'Mr.',
    bio: 'Demo account for app store review.',
    status: 'active',
    isActivated: true,
    activationDate: now,
    paymentStatus: 'completed',
    paymentDate: now,
    paymentAmount: 0,
    paymentMethod: 'complimentary',
    paymentReference: 'app-store-review',
    'subscription.billingCycle': 'yearly',
    'subscription.expiresAt': oneYear,
    updatedAt: now,
  };

  let rep = existingUser?.medicalRepresentativeProfile
    ? await reps.findOne({ _id: existingUser.medicalRepresentativeProfile })
    : await reps.findOne({ email });

  if (rep) {
    await reps.updateOne(
      { _id: rep._id },
      { $set: repFields, $unset: { inviteDeferred: '', activationTokenHash: '', activationTokenExpiresAt: '', activationCheckoutId: '' } }
    );
  } else {
    const { insertedId } = await reps.insertOne({
      ...Object.fromEntries(Object.entries(repFields).filter(([k]) => !k.includes('.'))),
      phone: '09000000000', // placeholder, never verified: no SMS sign-in
      products: [],
      subscription: { billingCycle: 'yearly', expiresAt: oneYear, paymentHistory: [] },
      performanceMetrics: { totalVisits: 0, completedVisits: 0, cancelledVisits: 0, lastUpdated: now },
      notificationsEnabled: true,
      emailNotifications: false,
      createdAt: now,
    });
    rep = await reps.findOne({ _id: insertedId });
  }

  const userSet = {
    name: 'App Reviewer',
    password: hash,
    role: role._id,
    isActive: true,
    status: 'active',
    mustSetPassword: false,
    totpEnabled: false,
    medicalRepresentativeProfile: rep!._id,
    updatedAt: now,
  };
  const userUnset = { totpSecret: '', totpPendingSecret: '', inviteTokenHash: '', inviteExpiresAt: '', tempPassword: '' };

  let userId = existingUser?._id;
  if (existingUser) {
    // New password: sign out any device still holding the old one.
    await users.updateOne({ _id: existingUser._id }, { $set: userSet, $unset: userUnset, $inc: { sessionVersion: 1 } });
  } else {
    const { insertedId } = await users.insertOne({ ...userSet, email, tenantId: null, sessionVersion: 0, createdAt: now });
    userId = insertedId;
  }
  await reps.updateOne({ _id: rep!._id }, { $set: { userId } });

  await mongoose.disconnect();

  console.log(`\n✅  Review rep ${existingUser ? 'refreshed' : 'created'} in ${describeMongoUri(uri)}`);
  console.log(`    email:    ${email}`);
  console.log(`    password: ${password}`);
  console.log(`    booking subscription until ${oneYear.toISOString().slice(0, 10)}`);
  console.log('    Sign in with email + password (not the texted code).\n');
}

main().catch(async (err) => {
  console.error(`❌  ${err instanceof Error ? err.message : err}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
