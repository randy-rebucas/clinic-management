import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import HealthSummaryShareLink from '@/models/HealthSummaryShareLink';
import Patient from '@/models/Patient';
import { createAuditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/middleware/rate-limit';
import { linkedRecords } from '@/app/api/patients/me/_lib/linked-records';
import { scopedTenantIds } from '@/app/api/patients/me/_lib/patient-scope';
import { familyAccess, type FamilyAccess } from '@/lib/patient-family';
import { accountAccess } from '@/lib/emcr/account';
import type { PatientSessionPayload } from '@/app/lib/dal';

/**
 * Revocable links that let a patient share their health summary PDF with another doctor
 * (POST/GET /api/patients/me/share-links, DELETE …/:id; opened at GET /api/share/:token).
 *
 * - The token is 32 random bytes (base64url, 43 characters); only its SHA-256 is stored, so a
 *   database read never yields a working link. The URL is returned once, at creation.
 * - The patient picks how long it lasts (24 hours, 7 days or 30 days) and may revoke it at any
 *   time. At most MAX_ACTIVE_SHARE_LINKS are live per patient.
 * - The PDF covers the same clinics as the session that made the link (its `tid`), re-read at
 *   every open, so it always shows the current record.
 * - A link made for a family member stops working once the sharer no longer manages them.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SHARE_LINK_DURATIONS = { '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS } as const;
export type ShareLinkDuration = keyof typeof SHARE_LINK_DURATIONS;

/** Live (unexpired, unrevoked) links one patient may hold at a time. */
export const MAX_ACTIVE_SHARE_LINKS = 10;
/** The list shows live links and those that ended within this many days. */
export const SHARE_LINK_HISTORY_DAYS = 90;
export const SHARE_LABEL_MAX = 80;
const LIST_LIMIT = 50;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export type ShareLinkStatus = 'active' | 'expired' | 'revoked';

export type ShareLinkLean = {
  _id: Types.ObjectId;
  patient: Types.ObjectId;
  tid?: Types.ObjectId;
  sharedBy?: Types.ObjectId;
  account?: Types.ObjectId;
  label?: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  accessCount?: number;
  lastAccessedAt?: Date | null;
  createdAt: Date;
};

/** What the app sees of a link. Never the token or its hash. */
export type ShareLinkView = {
  id: string;
  label: string | null;
  status: ShareLinkStatus;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  /** Made by a family manager for this profile. */
  sharedByFamily: boolean;
};

export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(`health-summary-share:${token}`).digest('hex');
}

export function isWellFormedShareToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN.test(token);
}

export function shareLinkStatus(link: Pick<ShareLinkLean, 'expiresAt' | 'revokedAt'>, now = new Date()): ShareLinkStatus {
  if (link.revokedAt) return 'revoked';
  return new Date(link.expiresAt).getTime() > now.getTime() ? 'active' : 'expired';
}

export function toShareLinkView(link: ShareLinkLean, now = new Date()): ShareLinkView {
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
  return {
    id: String(link._id),
    label: link.label || null,
    status: shareLinkStatus(link, now),
    createdAt: new Date(link.createdAt).toISOString(),
    expiresAt: new Date(link.expiresAt).toISOString(),
    revokedAt: iso(link.revokedAt),
    accessCount: link.accessCount ?? 0,
    lastAccessedAt: iso(link.lastAccessedAt),
    sharedByFamily: Boolean(link.sharedBy || link.account),
  };
}

/** The patient's label, one line of plain text (control characters dropped), or undefined. */
export function cleanShareLabel(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  // Control characters become spaces; \s also covers the Unicode line and paragraph separators.
  const printable = Array.from(raw, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : ch;
  }).join('');
  const text = printable.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, SHARE_LABEL_MAX) : undefined;
}

export type ShareLinkInput = { duration: ShareLinkDuration; label?: string };

export function parseShareLinkInput(body: unknown): { ok: true; value: ShareLinkInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const duration = b.duration;
  if (typeof duration !== 'string' || !Object.prototype.hasOwnProperty.call(SHARE_LINK_DURATIONS, duration)) {
    return { ok: false, error: 'Choose how long the link lasts: 24h, 7d or 30d.' };
  }
  if (b.label != null && typeof b.label !== 'string') return { ok: false, error: 'Invalid label.' };
  const label = cleanShareLabel(b.label);
  return { ok: true, value: { duration: duration as ShareLinkDuration, ...(label ? { label } : {}) } };
}

type ShareSession = Pick<PatientSessionPayload, 'patientId' | 'tid' | 'guardianId' | 'acc' | 'rel'>;

/** Whether this session is acting for a family member rather than the account holder. */
export function sharesForFamilyMember(session: ShareSession): boolean {
  return Boolean(session.guardianId) || session.rel === 'guardian';
}

export async function createShareLink(
  session: ShareSession,
  input: ShareLinkInput,
  now = new Date()
): Promise<{ ok: true; token: string; link: ShareLinkLean } | { ok: false; reason: 'limit' }> {
  await connectDB();
  const patient = new Types.ObjectId(session.patientId);
  const live = await HealthSummaryShareLink.countDocuments({ patient, revokedAt: null, expiresAt: { $gt: now } });
  if (live >= MAX_ACTIVE_SHARE_LINKS) return { ok: false, reason: 'limit' };

  const forFamily = sharesForFamilyMember(session);
  const token = generateShareToken();
  const created = await HealthSummaryShareLink.create({
    tokenHash: hashShareToken(token),
    patient,
    ...(session.tid && OBJECT_ID.test(session.tid) ? { tid: new Types.ObjectId(session.tid) } : {}),
    ...(forFamily && session.guardianId ? { sharedBy: new Types.ObjectId(session.guardianId) } : {}),
    ...(forFamily && session.acc && OBJECT_ID.test(session.acc) ? { account: new Types.ObjectId(session.acc) } : {}),
    ...(input.label ? { label: input.label } : {}),
    expiresAt: new Date(now.getTime() + SHARE_LINK_DURATIONS[input.duration]),
    accessCount: 0,
  });
  return { ok: true, token, link: created.toObject() as ShareLinkLean };
}

/** Live links and those that ended recently, newest first. */
export async function listShareLinks(patientId: string, now = new Date()): Promise<ShareLinkLean[]> {
  await connectDB();
  const since = new Date(now.getTime() - SHARE_LINK_HISTORY_DAYS * DAY_MS);
  return HealthSummaryShareLink.find({
    patient: new Types.ObjectId(patientId),
    $or: [{ revokedAt: null, expiresAt: { $gt: since } }, { revokedAt: { $gt: since } }],
  })
    .select('-tokenHash')
    .sort({ createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean<ShareLinkLean[]>();
}

/**
 * Revoke one of this patient's links. Revoking an already revoked link returns it unchanged
 * (`changed: false`); null when the id isn't one of theirs.
 */
export async function revokeShareLink(
  patientId: string,
  id: string,
  now = new Date()
): Promise<{ link: ShareLinkLean; changed: boolean } | null> {
  if (!OBJECT_ID.test(id)) return null;
  await connectDB();
  const filter = { _id: new Types.ObjectId(id), patient: new Types.ObjectId(patientId) };
  const updated = await HealthSummaryShareLink.findOneAndUpdate(
    { ...filter, revokedAt: null },
    { $set: { revokedAt: now } },
    { new: true }
  )
    .select('-tokenHash')
    .lean<ShareLinkLean | null>();
  if (updated) return { link: updated, changed: true };
  const existing = await HealthSummaryShareLink.findOne(filter).select('-tokenHash').lean<ShareLinkLean | null>();
  return existing ? { link: existing, changed: false } : null;
}

export type ResolvedShareLink =
  | { ok: true; link: ShareLinkLean; patientId: string; tid?: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'ended' };

/**
 * The link behind a public token, with the clinic scope its PDF should cover. Fails for an
 * unknown, revoked or expired token, and for a family member's link once the sharer no longer
 * manages that person (`ended`).
 */
export async function resolveShareLink(token: unknown, now = new Date()): Promise<ResolvedShareLink> {
  if (!isWellFormedShareToken(token)) return { ok: false, reason: 'invalid' };
  await connectDB();
  const link = await HealthSummaryShareLink.findOne({ tokenHash: hashShareToken(token) }).lean<ShareLinkLean | null>();
  if (!link) return { ok: false, reason: 'invalid' };
  const status = shareLinkStatus(link, now);
  if (status !== 'active') return { ok: false, reason: status };

  const patientId = String(link.patient);
  let tid = link.tid ? String(link.tid) : undefined;
  if (link.sharedBy || link.account) {
    const access = await familyLinkAccess(link, patientId);
    if (!access) return { ok: false, reason: 'ended' };
    // A staff-made family link stays at its clinic.
    if (access.tid) {
      if (tid && tid !== access.tid) return { ok: false, reason: 'ended' };
      tid = access.tid;
    }
  }
  return { ok: true, link, patientId, ...(tid ? { tid } : {}) };
}

async function familyLinkAccess(link: ShareLinkLean, patientId: string): Promise<FamilyAccess | null> {
  const viaGuardian = link.sharedBy ? await familyAccess(String(link.sharedBy), patientId) : null;
  const viaAccount = link.account ? await accountAccess(String(link.account), patientId) : null;
  // The widest wins: an unscoped link over a clinic-scoped one (as app/lib/patient-auth.ts).
  return [viaGuardian, viaAccount].filter((a): a is FamilyAccess => a !== null).sort((a, b) => (a.tid ? 1 : 0) - (b.tid ? 1 : 0))[0] ?? null;
}

/** Count one successful open. */
export async function recordShareAccess(id: Types.ObjectId | string, now = new Date()): Promise<void> {
  await connectDB();
  await HealthSummaryShareLink.updateOne({ _id: id }, { $inc: { accessCount: 1 }, $set: { lastAccessedAt: now } });
}

/**
 * Audit trail (PH DPA): one entry per clinic whose records the link covers, so each clinic's
 * log shows its patient's data leaving through a share. Opens are logged by the public route,
 * per clinic that actually went into the PDF.
 */
export async function logShareLinkEvent(opts: {
  event: 'created' | 'revoked';
  link: ShareLinkLean;
  session: Pick<PatientSessionPayload, 'patientId' | 'email' | 'guardianId'>;
  request: { headers: Headers; nextUrl?: { pathname: string } };
}): Promise<void> {
  const { event, link, session, request } = opts;
  const patientId = String(link.patient);
  let tenants: unknown[] = [];
  try {
    await connectDB();
    const patient = await Patient.findById(patientId).select('tenantIds accountId').lean<{ _id: unknown; tenantIds?: unknown[]; accountId?: unknown } | null>();
    if (patient) {
      const linked = await linkedRecords(patient);
      tenants = scopedTenantIds(linked.tenantIds, link.tid ? { tid: String(link.tid) } : null) ?? [];
    }
  } catch {
    // Still log, without a clinic.
  }
  const expires = new Date(link.expiresAt).toISOString();
  const description =
    event === 'created'
      ? `Patient created a link sharing their health summary until ${expires}${link.label ? ` (for: ${link.label})` : ''}`
      : `Patient revoked a health summary share link${link.label ? ` (for: ${link.label})` : ''}`;
  await Promise.all(
    (tenants.length ? tenants : [undefined]).map((tenantId) =>
      createAuditLog({
        userId: session.guardianId ?? session.patientId,
        userEmail: session.email,
        userRole: 'patient',
        tenantId: tenantId as string | undefined,
        action: event === 'created' ? 'data_export' : 'update',
        resource: 'patient',
        resourceId: patientId,
        dataSubject: patientId,
        isSensitive: true,
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent') ?? undefined,
        requestPath: request.nextUrl?.pathname,
        description,
        metadata: {
          shareLinkId: String(link._id),
          expiresAt: expires,
          ...(session.guardianId ? { guardianPatientId: session.guardianId } : {}),
        },
      })
    )
  );
}
