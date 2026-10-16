/**
 * Find login accounts still using a password that model hooks used to assign automatically
 * ('Password1234!', the Admin formula `Admin<First2><PhoneLast4>!`, the Staff formula
 * `Staff<EmployeeIdOrPhoneLast4>!`) and lock them behind a set-password invite.
 *
 *   npx tsx scripts/rotate-default-passwords.ts            # dry run (default): report only
 *   npx tsx scripts/rotate-default-passwords.ts --apply    # rotate + email invites
 *
 * On --apply each affected user gets a random unusable password, mustSetPassword=true, a fresh
 * 72h invite token, and all sessions revoked; then the invite email is sent. If SMTP is not
 * configured the accounts stay locked and admins re-send invites via POST /api/users/:id/invite.
 *
 * Output never contains passwords or tokens; emails are masked.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  generateInviteToken,
  inviteUpdate,
  maskEmail,
  randomUnusablePasswordHash,
  sendSetPasswordEmail,
  type InviteDelivery,
} from '../lib/user-invite';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 25;
const COMMON_DEFAULT = 'Password1234!';

type Reason = 'common-default' | 'admin-formula' | 'staff-formula';

interface UserRow {
  _id: Types.ObjectId;
  email?: string;
  name?: string;
  password?: string;
  tenantId?: Types.ObjectId | null;
  adminProfile?: Types.ObjectId | null;
  staffInfo?: Types.ObjectId | null;
}

interface AdminRow { _id: Types.ObjectId; firstName?: string; phone?: string }
interface StaffRow { _id: Types.ObjectId; phone?: string; employeeId?: string }

function adminFormula(admin: AdminRow): string | null {
  if (!admin.firstName) return null;
  return `Admin${admin.firstName.slice(0, 2).toUpperCase()}${admin.phone?.slice(-4) || '1234'}!`;
}

function staffFormula(staff: StaffRow): string | null {
  const suffix = staff.employeeId?.slice(-4) || staff.phone?.slice(-4);
  return suffix ? `Staff${suffix}!` : null;
}

async function matchReason(
  user: UserRow,
  admins: Map<string, AdminRow>,
  staff: Map<string, StaffRow>
): Promise<Reason | null> {
  if (!user.password || !user.password.startsWith('$2')) return null;
  const candidates: Array<[Reason, string | null]> = [['common-default', COMMON_DEFAULT]];
  if (user.adminProfile) {
    const admin = admins.get(String(user.adminProfile));
    if (admin) candidates.push(['admin-formula', adminFormula(admin)]);
  }
  if (user.staffInfo) {
    const s = staff.get(String(user.staffInfo));
    if (s) candidates.push(['staff-formula', staffFormula(s)]);
  }
  for (const [reason, candidate] of candidates) {
    if (candidate && (await bcrypt.compare(candidate, user.password))) return reason;
  }
  return null;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (rotating passwords, sending invites)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

  const Admin = (await import('../models/Admin')).default;
  const Staff = (await import('../models/Staff')).default;
  const users = mongoose.connection.collection('users');

  const counts = { scanned: 0, matched: 0, rotated: 0 };
  const byReason: Record<Reason, number> = { 'common-default': 0, 'admin-formula': 0, 'staff-formula': 0 };
  const deliveries: Record<InviteDelivery, number> = { sent: 0, 'not-configured': 0, failed: 0 };

  const cursor = users.find(
    { mustSetPassword: { $ne: true }, password: { $type: 'string' } },
    { projection: { email: 1, name: 1, password: 1, tenantId: 1, adminProfile: 1, staffInfo: 1 } }
  );

  let batch: UserRow[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const isId = (v: Types.ObjectId | null | undefined): v is Types.ObjectId => !!v;
    const adminIds = batch.map((u) => u.adminProfile).filter(isId);
    const staffIds = batch.map((u) => u.staffInfo).filter(isId);
    const [adminRows, staffRows] = await Promise.all([
      adminIds.length
        ? Admin.collection.find({ _id: { $in: adminIds } }, { projection: { firstName: 1, phone: 1 } }).toArray()
        : [],
      staffIds.length
        ? Staff.collection.find({ _id: { $in: staffIds } }, { projection: { phone: 1, employeeId: 1 } }).toArray()
        : [],
    ]);
    const admins = new Map((adminRows as unknown as AdminRow[]).map((a) => [String(a._id), a]));
    const staff = new Map((staffRows as unknown as StaffRow[]).map((s) => [String(s._id), s]));

    const reasons = await Promise.all(batch.map((u) => matchReason(u, admins, staff)));
    for (let i = 0; i < batch.length; i++) {
      const user = batch[i];
      const reason = reasons[i];
      counts.scanned++;
      if (!reason) continue;
      counts.matched++;
      byReason[reason]++;
      console.log(`  match: ${maskEmail(user.email)} tenant=${user.tenantId ? String(user.tenantId) : 'none'} (${reason})`);

      if (!APPLY) continue;
      const invite = generateInviteToken();
      const res = await users.updateOne(
        { _id: user._id, password: user.password },
        {
          $set: { password: await randomUnusablePasswordHash(), mustSetPassword: true, ...inviteUpdate(invite) },
          $inc: { sessionVersion: 1 },
        }
      );
      if (!res.modifiedCount) continue; // password changed meanwhile
      counts.rotated++;
      const delivery = await sendSetPasswordEmail({
        email: String(user.email),
        name: user.name || 'there',
        token: invite.token,
        tenantId: user.tenantId ?? null,
        kind: 'reset',
      });
      deliveries[delivery]++;
    }
    batch = [];
  };

  for await (const doc of cursor) {
    batch.push(doc as unknown as UserRow);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log('\n=== Summary');
  console.log(`  Users scanned:            ${counts.scanned}`);
  console.log(`  Using a default password: ${counts.matched}`);
  console.log(`    'Password1234!':        ${byReason['common-default']}`);
  console.log(`    Admin formula:          ${byReason['admin-formula']}`);
  console.log(`    Staff formula:          ${byReason['staff-formula']}`);
  if (APPLY) {
    console.log(`  Rotated:                  ${counts.rotated}`);
    console.log(`  Invites sent:             ${deliveries.sent}`);
    console.log(`  Not sent (no SMTP):       ${deliveries['not-configured']}`);
    console.log(`  Send failures:            ${deliveries.failed}`);
    if (deliveries['not-configured'] || deliveries.failed) {
      console.log('  Accounts without a delivered invite stay locked; re-send via POST /api/users/:id/invite.');
    }
  } else if (counts.matched) {
    console.log('  Dry run only. Re-run with --apply to rotate and send invites.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Rotation failed:', err instanceof Error ? err.message : 'unknown error');
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
