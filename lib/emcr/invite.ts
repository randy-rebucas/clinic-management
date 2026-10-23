import 'server-only';
import { createHash, randomInt } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrInvite, { type EmcrInviteChannel, type EmcrInviteMode } from '@/models/EmcrInvite';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { normalizePhone } from '@/lib/phone';
import { sendSMS } from '@/lib/sms';
import { maskPhone } from '@/app/api/patients/auth/shared';
import { linkRecordsByVerifiedPhone } from '@/app/api/patients/me/_lib/linked-records';
import { addClinicGuardian, personRecordIds } from '@/lib/patient-family';
import { attachSelf, forgetAccountCache, type EmcrAccountLean } from '@/lib/emcr/account';
import { ensureLoginId } from '@/lib/emcr/login-id';

/**
 * Clinic-issued app invites (models/EmcrInvite.ts). The clinic already knows who is at the desk
 * and who their children are, so the invite replaces the "first name + birth date" questions:
 * the invitee scans the slip (or opens the texted link), gets an SMS code on the number staff
 * confirmed, and lands signed in with every record the invite names.
 */

export const INVITE_TTL_DAYS = 14;
/** No 0/O, 1/I/L: the code is read off paper. 32 symbols × 8 = 40 bits. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_DEPENDENTS = 10;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
  return code;
}

/** "ABCD2345" → "ABCD-2345", as printed. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * The bare code from what the app scanned or the person typed: "abcd-2345", the texted link
 * (https://…/i/ABCD2345) or the app link (myclinicsoft://invite?c=ABCD2345). Null if malformed.
 */
export function parseInviteCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let raw = input.trim();
  const fromLink = raw.match(/[?&]c=([A-Za-z0-9-]+)/) ?? raw.match(/\/i\/([A-Za-z0-9-]+)\/?$/);
  if (fromLink) raw = fromLink[1];
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(`emcr-invite:${code}`).digest('hex');
}

/** The link texted and encoded in the slip's QR: a web page that opens the app. */
export function inviteLink(code: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'https://myclinicsoft.com').replace(/\/$/, '')}/i/${code}`;
}

export type InviteLean = {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  mode: EmcrInviteMode;
  patientId: Types.ObjectId;
  dependentIds?: Types.ObjectId[];
  relationship?: string;
  phone: string;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
};

export type InviteLookup = { ok: true; invite: InviteLean } | { ok: false; reason: 'invalid' | 'used' | 'expired' };

/** The invite behind `code`, if it can still be redeemed. Revoked reads as unknown. */
export async function findUsableInvite(code: string, now = new Date()): Promise<InviteLookup> {
  await connectDB();
  const invite = await EmcrInvite.findOne({ codeHash: hashInviteCode(code) }).lean<InviteLean | null>();
  if (!invite || invite.revokedAt) return { ok: false, reason: 'invalid' };
  if (invite.usedAt) return { ok: false, reason: 'used' };
  if (invite.expiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true, invite };
}

/** Cancel this clinic's unused invites for the patient (a new one replaces them). */
export async function revokeInvites(tenantId: Types.ObjectId, patientId: Types.ObjectId): Promise<number> {
  await connectDB();
  const result = await EmcrInvite.updateMany(
    { tenantId, patientId, usedAt: { $exists: false }, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
  return result.modifiedCount;
}

export async function issueInvite(options: {
  tenantId: Types.ObjectId;
  patientId: Types.ObjectId;
  mode: EmcrInviteMode;
  phone: string;
  channel: EmcrInviteChannel;
  dependentIds?: Types.ObjectId[];
  relationship?: string;
  issuedBy?: string;
}): Promise<{ code: string; expiresAt: Date }> {
  await connectDB();
  await revokeInvites(options.tenantId, options.patientId);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  for (let attempt = 0; ; attempt++) {
    const code = generateInviteCode();
    try {
      await EmcrInvite.create({
        codeHash: hashInviteCode(code),
        tenantId: options.tenantId,
        mode: options.mode,
        patientId: options.patientId,
        dependentIds: (options.dependentIds ?? []).slice(0, MAX_DEPENDENTS),
        relationship: options.mode === 'guardian' ? options.relationship : undefined,
        phone: options.phone,
        channel: options.channel,
        issuedBy: options.issuedBy && Types.ObjectId.isValid(options.issuedBy) ? new Types.ObjectId(options.issuedBy) : undefined,
        expiresAt,
      });
      return { code, expiresAt };
    } catch (error: any) {
      // A code collision (unique codeHash) is vanishingly rare; pick another.
      if (error?.code !== 11000 || attempt >= 3) throw error;
    }
  }
}

async function clinicName(tenantId: Types.ObjectId): Promise<string> {
  const tenant = await Tenant.findById(tenantId).select('name displayName').lean<{ name?: string; displayName?: string } | null>();
  return tenant?.displayName || tenant?.name || 'Your clinic';
}

/** Text the invite link to the invite's phone. */
export async function sendInviteSms(options: { code: string; phone: string; tenantId: Types.ObjectId; firstName?: string }): Promise<boolean> {
  const clinic = await clinicName(options.tenantId);
  const name = options.firstName ? `Hi ${options.firstName}, ` : '';
  const result = await sendSMS({
    to: options.phone,
    message: `${name}${clinic} invited you to eMCR, your health records app. Open ${inviteLink(options.code)} or enter code ${formatInviteCode(options.code)} in the app. Valid ${INVITE_TTL_DAYS} days.`,
  });
  return !!result.success;
}

/** "Maria Dela Cruz" → "Maria D." */
function shortName(first?: string, last?: string): string {
  const initial = last?.trim()?.[0];
  return [first?.trim(), initial ? `${initial.toUpperCase()}.` : ''].filter(Boolean).join(' ') || 'Patient';
}

/** What the app shows before sending the code: enough to recognise the invite, nothing more. */
export async function invitePreview(invite: InviteLean) {
  await connectDB();
  const ids = [invite.patientId, ...(invite.dependentIds ?? [])];
  const records = await Patient.find({ _id: { $in: ids }, active: { $ne: false } })
    .select('firstName lastName')
    .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string }[]>();
  const byId = new Map(records.map((r) => [String(r._id), r]));
  const people = ids.map((id) => byId.get(String(id))).filter((r): r is NonNullable<typeof r> => !!r);
  return {
    clinicName: await clinicName(invite.tenantId),
    mode: invite.mode,
    people: people.map((p) => shortName(p.firstName, p.lastName)),
    phoneHint: maskPhone(invite.phone),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export type RedeemResult =
  | { ok: true; accountId: Types.ObjectId }
  | { ok: false; reason: 'used' | 'record_changed' | 'self_taken' };

/**
 * Spend the invite for the account that just proved `invite.phone`, then link what it names.
 * The invite is marked used first (one update), so two devices can't both redeem it.
 */
export async function redeemInvite(invite: InviteLean, account: EmcrAccountLean, now = new Date()): Promise<RedeemResult> {
  await connectDB();
  const tenantId = invite.tenantId;
  const records = await Patient.find({
    _id: { $in: [invite.patientId, ...(invite.dependentIds ?? [])] },
    tenantIds: tenantId,
    active: { $ne: false },
  })
    .select('phone')
    .lean<{ _id: Types.ObjectId; phone?: string }[]>();
  const main = records.find((r) => String(r._id) === String(invite.patientId));
  if (!main) return { ok: false, reason: 'record_changed' };

  if (invite.mode === 'self') {
    // The clinic may have changed the number since issuing; then this phone is no longer theirs.
    if (!main.phone || normalizePhone(main.phone) !== invite.phone) return { ok: false, reason: 'record_changed' };
    if (account.selfPatientId) {
      const mine = await personRecordIds(account.selfPatientId);
      if (!mine.some((id) => String(id) === String(main._id))) {
        const theirs = await personRecordIds(main._id);
        if (!theirs.some((id) => String(id) === String(account.selfPatientId))) return { ok: false, reason: 'self_taken' };
      }
    }
  }

  const spent = await EmcrInvite.updateOne(
    { _id: invite._id, usedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { usedAt: now, usedByAccount: account._id } }
  );
  if (spent.modifiedCount !== 1) return { ok: false, reason: 'used' };

  if (invite.mode === 'self') {
    await linkRecordsByVerifiedPhone(String(main._id), invite.phone);
    if (!account.selfPatientId) await attachSelf(account._id, main._id);
    // This clinic's location code starts the login ID (used once a password is set).
    await ensureLoginId(account._id, tenantId);
    return { ok: true, accountId: account._id };
  }

  // guardian: a staff link at this clinic, on the child's record when the invitee has their own
  // record (the family rules), else on the account.
  const relationship = invite.relationship || 'other';
  const dependents = records.filter((r) => String(r._id) !== String(account.selfPatientId));
  if (account.selfPatientId) {
    for (const r of dependents) {
      await addClinicGuardian({ dependentId: r._id, guardianId: account.selfPatientId, tenantId, relationship });
    }
  } else {
    const have = new Set((account.dependents ?? []).map((d) => String(d.patientId)));
    const fresh = dependents.filter((r) => !have.has(String(r._id)));
    if (fresh.length) {
      await EmcrAccount.updateOne(
        { _id: account._id },
        {
          $push: {
            dependents: {
              $each: fresh.map((r) => ({ patientId: r._id, relationship, source: 'clinic', tenantId, addedAt: now })),
            },
          },
        }
      );
    }
    forgetAccountCache();
  }
  return { ok: true, accountId: account._id };
}
