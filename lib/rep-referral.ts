import 'server-only';
import { randomInt } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import RepReferralCode, { REFERRAL_CODE_PATTERN, type IRepReferralCode } from '@/models/RepReferralCode';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Tenant from '@/models/Tenant';

/**
 * Rep referral codes: a rep (Rep app) or a platform admin (console) makes a code, the rep shares
 * it or its signup link, and a clinic that enters it, at registration or later on its billing
 * page, gets the rep added to its representatives (MedicalRepresentative.tenantIds). That is what
 * lets the clinic ask the rep to sponsor its plan (lib/clinic-sponsorship.ts).
 */

// No 0/O or 1/I/L: codes are read aloud and typed from printed cards.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function normalizeReferralCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase().replace(/\s+/g, '');
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

export function newRepCode(): string {
  let s = 'REP-';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** The clinic signup link that carries the code. */
export function referralLink(code: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
  const url = new URL('/tenant-onboard', base);
  url.searchParams.set('ref', code);
  return url.toString();
}

const repName = (r: { firstName?: string; lastName?: string }) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();

export type ReferralLookup =
  | { ok: true; codeId: Types.ObjectId; code: string; repId: Types.ObjectId; rep: { name: string; company: string | null } }
  | { ok: false; error: string };

const NOT_VALID = 'That code isn’t valid. Check it with your rep.';

/** Whether a code can be used right now, and whose it is. */
export async function lookupReferralCode(input: unknown): Promise<ReferralLookup> {
  const code = normalizeReferralCode(input);
  if (!code) return { ok: false, error: NOT_VALID };
  await connectDB();
  const doc = await RepReferralCode.findOne({ code }).lean<IRepReferralCode | null>();
  if (!doc || doc.status !== 'active') return { ok: false, error: NOT_VALID };
  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) return { ok: false, error: 'That code has expired.' };
  if (doc.maxUses && doc.uses >= doc.maxUses) return { ok: false, error: 'That code has been used up.' };
  const rep = await MedicalRepresentative.findById(doc.repId)
    .select('firstName lastName company status isActivated')
    .lean<{ firstName: string; lastName: string; company?: string; status?: string; isActivated?: boolean } | null>();
  // Only reps who can actually work with clinics (activated, not on leave or off).
  if (!rep || rep.status !== 'active' || !rep.isActivated) return { ok: false, error: NOT_VALID };
  return { ok: true, codeId: doc._id as Types.ObjectId, code, repId: doc.repId, rep: { name: repName(rep), company: rep.company || null } };
}

export type RedeemResult =
  | { ok: true; rep: { name: string; company: string | null }; alreadyLinked: boolean }
  | { ok: false; error: string };

/**
 * Link the code's rep to the clinic. A rep already linked is not counted again; a code that
 * reached its limit in the meantime is refused. The first code a clinic uses is kept on the
 * tenant (Tenant.referral) as who referred it.
 */
export async function redeemReferralCode(tenantId: string | Types.ObjectId, input: unknown): Promise<RedeemResult> {
  const found = await lookupReferralCode(input);
  if (!found.ok) return found;
  const tid = new Types.ObjectId(String(tenantId));

  const already = await MedicalRepresentative.exists({ _id: found.repId, tenantIds: tid });
  if (already) return { ok: true, rep: found.rep, alreadyLinked: true };

  const counted = await RepReferralCode.findOneAndUpdate(
    {
      _id: found.codeId,
      status: 'active',
      $and: [
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ maxUses: { $exists: false } }, { maxUses: null }, { $expr: { $lt: ['$uses', '$maxUses'] } }] },
      ],
    },
    { $inc: { uses: 1 } },
    { new: true }
  ).select('_id').lean();
  if (!counted) return { ok: false, error: 'That code has been used up.' };

  await MedicalRepresentative.updateOne({ _id: found.repId }, { $addToSet: { tenantIds: tid } });
  await Tenant.updateOne(
    { _id: tid, 'referral.repId': { $exists: false } },
    { $set: { referral: { codeId: found.codeId, code: found.code, repId: found.repId, at: new Date() } } }
  );
  return { ok: true, rep: found.rep, alreadyLinked: false };
}

// ---------------------------------------------------------------------------------------------
// Rep side

export interface RepReferralView {
  code: string;
  link: string;
  /** Clinics that registered or linked with any of the rep's codes, newest first. */
  clinics: { name: string; joinedOn: string }[];
  total: number;
}

async function activeRepCode(repId: Types.ObjectId): Promise<IRepReferralCode> {
  const existing = await RepReferralCode.findOne({ repId, source: 'rep', status: 'active' }).lean<IRepReferralCode | null>();
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return (await RepReferralCode.create({ code: newRepCode(), repId, source: 'rep', createdBy: 'rep' })).toObject();
    } catch (e: any) {
      if (e?.code !== 11000) throw e;
      // Another request made the rep's code first, or (rarely) the random code was taken.
      const raced = await RepReferralCode.findOne({ repId, source: 'rep', status: 'active' }).lean<IRepReferralCode | null>();
      if (raced) return raced;
    }
  }
  throw new Error('Could not make a referral code');
}

export async function repReferralView(repId: Types.ObjectId, opts: { regenerate?: boolean } = {}): Promise<RepReferralView> {
  await connectDB();
  if (opts.regenerate) {
    await RepReferralCode.updateMany(
      { repId, source: 'rep', status: 'active' },
      { $set: { status: 'disabled', disabledAt: new Date() } }
    );
  }
  const doc = await activeRepCode(repId);
  const [clinics, total] = await Promise.all([
    // Newest referral first, as the app lists them (joinedOn): a clinic can link the code long after
    // signing up. The index is on createdAt; a rep's referred clinics are few, so the sort is cheap.
    Tenant.find({ 'referral.repId': repId }).sort({ 'referral.at': -1, createdAt: -1 }).limit(50).select('name displayName referral.at').lean<any[]>(),
    Tenant.countDocuments({ 'referral.repId': repId }),
  ]);
  return {
    code: doc.code,
    link: referralLink(doc.code),
    clinics: clinics.map((t) => ({ name: t.displayName || t.name, joinedOn: new Date(t.referral?.at ?? Date.now()).toISOString() })),
    total,
  };
}

// ---------------------------------------------------------------------------------------------
// Platform console

export interface PlatformReferralRow {
  id: string;
  code: string;
  link: string;
  source: 'rep' | 'platform';
  status: 'active' | 'disabled';
  label: string | null;
  rep: { id: string; name: string; email: string; company: string | null };
  uses: number;
  maxUses: number | null;
  expiresAt: string | null;
  expired: boolean;
  createdBy: string;
  createdAt: string;
}

export async function listReferralCodes(limit = 200): Promise<PlatformReferralRow[]> {
  await connectDB();
  const rows = await RepReferralCode.find({}).sort({ createdAt: -1 }).limit(limit).lean<IRepReferralCode[]>();
  const reps = await MedicalRepresentative.find({ _id: { $in: [...new Set(rows.map((r) => String(r.repId)))] } })
    .select('firstName lastName email company')
    .lean<any[]>();
  const byId = new Map(reps.map((r) => [String(r._id), r]));
  const now = Date.now();
  return rows.map((r) => {
    const rep = byId.get(String(r.repId));
    return {
      id: String(r._id),
      code: r.code,
      link: referralLink(r.code),
      source: r.source,
      status: r.status,
      label: r.label ?? null,
      rep: { id: String(r.repId), name: rep ? repName(rep) : 'Removed rep', email: rep?.email ?? '', company: rep?.company || null },
      uses: r.uses,
      maxUses: r.maxUses ?? null,
      expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      expired: !!r.expiresAt && new Date(r.expiresAt).getTime() <= now,
      createdBy: r.createdBy,
      createdAt: new Date(r.createdAt).toISOString(),
    };
  });
}

/** Activated reps a platform code can be made for. */
export async function referralRepOptions(): Promise<{ id: string; label: string }[]> {
  await connectDB();
  const reps = await MedicalRepresentative.find({ isActivated: true, status: 'active' })
    .sort({ lastName: 1, firstName: 1 })
    .select('firstName lastName email company')
    .lean<any[]>();
  return reps.map((r) => ({ id: String(r._id), label: `${repName(r)}${r.company ? ` (${r.company})` : ''} · ${r.email}` }));
}

export type CreateCodeResult = { ok: true; id: string; code: string } | { ok: false; error: string; status: number };

export async function createPlatformCode(opts: {
  repId: string;
  code?: string;
  label?: string;
  maxUses?: number;
  expiresAt?: Date;
  createdBy: string;
}): Promise<CreateCodeResult> {
  await connectDB();
  const rep = await MedicalRepresentative.findById(opts.repId).select('status isActivated').lean<{ status?: string; isActivated?: boolean } | null>();
  if (!rep) return { ok: false, error: 'Representative not found', status: 404 };
  if (rep.status !== 'active' || !rep.isActivated) return { ok: false, error: 'This rep isn’t active yet, so clinics couldn’t use the code.', status: 400 };
  const wanted = opts.code ? normalizeReferralCode(opts.code) : null;
  if (opts.code && !wanted) return { ok: false, error: 'Use 4–24 letters, digits or hyphens.', status: 400 };
  for (let attempt = 0; attempt < (wanted ? 1 : 5); attempt++) {
    try {
      const doc = await RepReferralCode.create({
        code: wanted ?? newRepCode(),
        repId: new Types.ObjectId(opts.repId),
        source: 'platform',
        label: opts.label,
        maxUses: opts.maxUses,
        expiresAt: opts.expiresAt,
        createdBy: opts.createdBy,
      });
      return { ok: true, id: String(doc._id), code: doc.code };
    } catch (e: any) {
      if (e?.code !== 11000) throw e;
      if (wanted) return { ok: false, error: 'That code is already taken.', status: 409 };
    }
  }
  return { ok: false, error: 'Could not make a code. Try again.', status: 500 };
}

export async function setReferralCodeStatus(id: string, status: 'active' | 'disabled'): Promise<IRepReferralCode | null> {
  await connectDB();
  try {
    return await RepReferralCode.findByIdAndUpdate(
      id,
      status === 'disabled' ? { $set: { status, disabledAt: new Date() } } : { $set: { status }, $unset: { disabledAt: 1 } },
      { new: true }
    ).lean<IRepReferralCode | null>();
  } catch (e: any) {
    // Re-enabling an old personal code while the rep has a newer active one.
    if (e?.code === 11000) return null;
    throw e;
  }
}
