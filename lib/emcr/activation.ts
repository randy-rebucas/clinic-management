import 'server-only';
import { createHmac, randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount, { type EmcrPlan } from '@/models/EmcrAccount';
import ActivationCode from '@/models/ActivationCode';
import VoucherBatch from '@/models/VoucherBatch';
import { deriveKey, type PatientSessionPayload } from '@/app/lib/dal';
import { decryptData, encryptData } from '@/lib/encryption';
import { findAccountForSession, type EmcrAccountLean } from '@/lib/emcr/account';

/**
 * eMCR activation, paid in cash: the patient buys a printed voucher (₱80) at a clinic counter and
 * types its code in the app. Each code gives one year, renewals stack on the current expiry.
 * The clinic bought the codes up front at the wholesale price (₱60, its 25% commission is the
 * difference), so no money moves through the app.
 */

export const VOUCHER_FACE_VALUE = 80;
export const VOUCHER_WHOLESALE_PRICE = 60;
export const ACTIVATION_DAYS = 365;
export const MAX_BATCH_QUANTITY = 1000;

/** No look-alikes (0/O, 1/I/L). 31^12 ≈ 7.9e17 codes. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What each plan unlocks. Today both unlock everything; `plus` is reserved for extras. */
export const EMCR_FEATURES = ['booking', 'check_in', 'queue', 'records', 'documents', 'health_summary'] as const;
export type EmcrFeature = (typeof EMCR_FEATURES)[number];
export const PLAN_FEATURES: Record<EmcrPlan, readonly EmcrFeature[]> = {
  basic: EMCR_FEATURES,
  plus: EMCR_FEATURES,
};

// ── Codes ─────────────────────────────────────────────────────────────────────

export function generateActivationCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** "ABCD-EFGH-JKMN" for printing. */
export function formatActivationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/**
 * What the patient typed, as a code: uppercase, spaces and dashes dropped. Null when it can't be
 * a code (wrong length or a character never used in codes).
 */
export function normalizeActivationCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Keyed hash used to look a code up; the database never holds a usable code in clear. */
export function hashActivationCode(code: string): string {
  return createHmac('sha256', deriveKey('emcr-voucher')).update(code).digest('hex');
}

/** New expiry for `days` more: counted from the current expiry when it is still ahead. */
export function extendedExpiry(current: Date | null | undefined, days: number, now = new Date()): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}

export function isActivationActive(
  activation: EmcrAccountLean['activation'] | null | undefined,
  now = new Date()
): boolean {
  return !!activation?.expiresAt && new Date(activation.expiresAt) > now;
}

export function activationView(account: Pick<EmcrAccountLean, 'activation'> | null, now = new Date()) {
  const activation = account?.activation;
  const active = isActivationActive(activation, now);
  const expiresAt = activation?.expiresAt ? new Date(activation.expiresAt) : null;
  return {
    active,
    plan: active ? (activation?.plan ?? 'basic') : null,
    activatedAt: activation?.activatedAt ? new Date(activation.activatedAt).toISOString() : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysLeft: active && expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS) : 0,
    enforced: activationEnforced(),
  };
}

/** Make `quantity` codes for a batch (not saved). Returns the clear codes for the sheet. */
export async function createBatchCodes(batch: { _id: Types.ObjectId; tenantId: Types.ObjectId; quantity: number }): Promise<string[]> {
  await connectDB();
  const codes = new Set<string>();
  while (codes.size < batch.quantity) codes.add(generateActivationCode());
  const list = [...codes];
  await ActivationCode.insertMany(
    list.map((code) => ({
      codeHash: hashActivationCode(code),
      codeEncrypted: encryptData(code),
      last4: code.slice(-4),
      batchId: batch._id,
      tenantId: batch.tenantId,
      status: 'unsold',
    }))
  );
  return list;
}

/** The batch's codes in clear, for (re)printing the voucher sheet. */
export async function readBatchCodes(batchId: Types.ObjectId): Promise<{ code: string; status: string }[]> {
  await connectDB();
  const rows = await ActivationCode.find({ batchId })
    .select('+codeEncrypted status')
    .sort({ _id: 1 })
    .lean<{ codeEncrypted: string; status: string }[]>();
  return rows.map((r) => ({ code: formatActivationCode(decryptData(r.codeEncrypted)), status: r.status }));
}

// ── Redeem ────────────────────────────────────────────────────────────────────

export type RedeemResult =
  | { ok: true; expiresAt: Date; plan: EmcrPlan; clinicName: string }
  | { ok: false; reason: 'invalid' | 'used' | 'not_paid' };

/**
 * Redeem a voucher code for an account. The code is claimed in one conditional update, so two
 * redemptions of one code (in parallel too) can't both succeed. Expiry is extended inside the
 * database update, so two different codes redeemed at once both count.
 */
export async function redeemActivationCode(accountId: Types.ObjectId, input: unknown, now = new Date()): Promise<RedeemResult> {
  const code = normalizeActivationCode(input);
  if (!code) return { ok: false, reason: 'invalid' };
  await connectDB();

  const row = await ActivationCode.findOne({ codeHash: hashActivationCode(code) })
    .select('batchId tenantId status')
    .lean<{ _id: Types.ObjectId; batchId: Types.ObjectId; tenantId: Types.ObjectId; status: string } | null>();
  if (!row || row.status === 'void') return { ok: false, reason: 'invalid' };
  if (row.status === 'redeemed') return { ok: false, reason: 'used' };

  const batch = await VoucherBatch.findById(row.batchId)
    .select('status plan days clinicName')
    .lean<{ _id: Types.ObjectId; status: string; plan?: EmcrPlan; days: number; clinicName: string } | null>();
  if (!batch || batch.status === 'void') return { ok: false, reason: 'invalid' };
  if (batch.status !== 'paid') return { ok: false, reason: 'not_paid' };

  const claimed = await ActivationCode.findOneAndUpdate(
    { _id: row._id, status: 'unsold' },
    { $set: { status: 'redeemed', redeemedBy: accountId, redeemedAt: now } },
    { new: true }
  );
  if (!claimed) return { ok: false, reason: 'used' };

  const plan: EmcrPlan = batch.plan ?? 'basic';
  const days = batch.days || ACTIVATION_DAYS;
  const stillActive = { $gt: [{ $ifNull: ['$activation.expiresAt', now] }, now] };
  const newExpiry = { $add: [{ $max: [now, { $ifNull: ['$activation.expiresAt', now] }] }, days * DAY_MS] };
  const updated = await EmcrAccount.findOneAndUpdate(
    { _id: accountId },
    [
      {
        $set: {
          activation: {
            // A plus voucher upgrades; a basic one never downgrades a running plus year.
            plan: plan === 'plus' ? 'plus' : { $cond: [{ $and: [stillActive, { $eq: ['$activation.plan', 'plus'] }] }, 'plus', 'basic'] },
            activatedAt: { $cond: [stillActive, { $ifNull: ['$activation.activatedAt', now] }, now] },
            expiresAt: newExpiry,
            remindersSent: [],
          },
          activationHistory: {
            $concatArrays: [
              { $ifNull: ['$activationHistory', []] },
              [{ source: 'code', plan, ref: String(row._id), batchId: batch._id, tenantId: row.tenantId, days, expiresAt: newExpiry, at: now }],
            ],
          },
        },
      },
    ],
    { new: true }
  ).lean<EmcrAccountLean | null>();

  if (!updated?.activation?.expiresAt) {
    // The account vanished between the checks: give the code back.
    await ActivationCode.updateOne({ _id: row._id, redeemedBy: accountId }, { $set: { status: 'unsold' }, $unset: { redeemedBy: 1, redeemedAt: 1 } });
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, expiresAt: new Date(updated.activation.expiresAt), plan: updated.activation.plan ?? plan, clinicName: batch.clinicName };
}

/** A platform admin grants days by hand (complaint, a lost voucher already paid for). */
export async function grantActivationManually(
  accountId: Types.ObjectId,
  options: { days: number; plan?: EmcrPlan; by: string; ref?: string },
  now = new Date()
): Promise<EmcrAccountLean | null> {
  await connectDB();
  const plan = options.plan ?? 'basic';
  const stillActive = { $gt: [{ $ifNull: ['$activation.expiresAt', now] }, now] };
  const newExpiry = { $add: [{ $max: [now, { $ifNull: ['$activation.expiresAt', now] }] }, options.days * DAY_MS] };
  return EmcrAccount.findOneAndUpdate(
    { _id: accountId },
    [
      {
        $set: {
          activation: {
            plan: plan === 'plus' ? 'plus' : { $cond: [{ $and: [stillActive, { $eq: ['$activation.plan', 'plus'] }] }, 'plus', 'basic'] },
            activatedAt: { $cond: [stillActive, { $ifNull: ['$activation.activatedAt', now] }, now] },
            expiresAt: newExpiry,
            remindersSent: [],
          },
          activationHistory: {
            $concatArrays: [
              { $ifNull: ['$activationHistory', []] },
              [{ source: 'manual', plan, ref: options.ref, days: options.days, expiresAt: newExpiry, at: now, by: options.by }],
            ],
          },
        },
      },
    ],
    { new: true }
  ).lean<EmcrAccountLean | null>();
}

// ── Gate ──────────────────────────────────────────────────────────────────────

/**
 * Paid features are refused without an active year only when EMCR_ACTIVATION_ENFORCED=true, so
 * the gate can be switched on once clinics have vouchers to sell.
 */
export function activationEnforced(): boolean {
  return process.env.EMCR_ACTIVATION_ENFORCED === 'true';
}

const gateCache = new Map<string, { account: EmcrAccountLean | null; expires: number }>();
const GATE_CACHE_MS = 30 * 1000;

/**
 * null when the session may use `feature`; otherwise a 402 `ACTIVATION_REQUIRED` response the app
 * turns into the "Enter activation code" screen. A family profile uses the manager's activation.
 */
export async function requireActiveEmcr(
  session: Pick<PatientSessionPayload, 'acc' | 'patientId' | 'guardianId'>,
  feature: EmcrFeature
): Promise<NextResponse | null> {
  if (!activationEnforced()) return null;
  const key = `${session.acc ?? ''}:${session.guardianId ?? session.patientId}`;
  let cached = gateCache.get(key);
  if (!cached || cached.expires < Date.now()) {
    cached = { account: await findAccountForSession(session), expires: Date.now() + GATE_CACHE_MS };
    gateCache.set(key, cached);
    if (gateCache.size > 5000) {
      const now = Date.now();
      for (const [k, entry] of gateCache) if (entry.expires < now) gateCache.delete(k);
    }
  }
  const activation = cached.account?.activation;
  if (isActivationActive(activation) && PLAN_FEATURES[activation?.plan ?? 'basic'].includes(feature)) return null;
  return NextResponse.json(
    {
      success: false,
      code: 'ACTIVATION_REQUIRED',
      error: isActivationActive(activation)
        ? 'Your eMCR plan does not include this.'
        : 'Activate eMCR with a voucher code from your clinic to use this.',
    },
    { status: 402 }
  );
}

/** After a redemption: this instance applies it at once. */
export function forgetActivationCache(): void {
  gateCache.clear();
}
