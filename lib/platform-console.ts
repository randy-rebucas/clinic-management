import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import SupportRequest, { type SupportStatus, type SupportCategory, type SupportReplyAuthor } from '@/models/SupportRequest';
import { escapeRegex } from '@/lib/api/validate';
import { getPlanPricing } from '@/lib/platform-config';
import { supportWaitingCount } from '@/lib/support-chat';
import PlatformInvoice from '@/models/PlatformInvoice';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import PlatformAnnouncement from '@/models/PlatformAnnouncement';
import Notification from '@/models/Notification';
import {
  computePlatformMetrics,
  isPaidPlan,
  lifecycleOf,
  monthlyValue,
  MRR_CURRENCY,
  type PlatformMetrics,
  type PlatformTenantRow,
  type TenantLifecycle,
} from '@/lib/platform-metrics';

/** Loaders for the platform console pages. Every value returned is plain JSON. */

const TENANT_FIELDS =
  'name displayName subdomain status createdAt email phone subscription.plan subscription.status subscription.billingCycle subscription.expiresAt subscription.paymentHistory';

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

async function allTenants(): Promise<(PlatformTenantRow & { displayName?: string })[]> {
  await connectDB();
  const rows = await Tenant.find({}).select(TENANT_FIELDS).lean<any[]>();
  return rows.map((t) => ({ ...t, _id: String(t._id) }));
}

// ── Overview ──────────────────────────────────────────────────────────────────

export interface PlatformOverview {
  metrics: PlatformMetrics;
  recentSignups: Array<{ id: string; name: string; subdomain: string; createdAt: string; lifecycle: TenantLifecycle }>;
  support: { open: number; waiting: number; chatsUnread: number };
  /** Trials ending and cancelling plans ending within ATTENTION_DAYS, soonest first. */
  attention: { trialsEnding: AttentionClinic[]; cancelling: AttentionClinic[] };
}

export interface AttentionClinic { id: string; name: string; expiresAt: string }

export const ATTENTION_DAYS = 7;

export async function loadPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const tenants = await allTenants();
  const [open, waiting, chatsUnread] = await Promise.all([
    SupportRequest.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
    SupportRequest.countDocuments({ status: { $in: ['open', 'in-progress'] }, lastReplyBy: { $ne: 'platform' } }),
    supportWaitingCount(),
  ]);
  const recentSignups = [...tenants]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)
    .map((t) => ({
      id: t._id,
      name: t.displayName || t.name,
      subdomain: t.subdomain,
      createdAt: iso(t.createdAt)!,
      lifecycle: lifecycleOf(t, now),
    }));
  const horizon = now.getTime() + ATTENTION_DAYS * 24 * 60 * 60 * 1000;
  const endingSoon = (life: TenantLifecycle) =>
    tenants
      .filter((t) => t.subscription?.expiresAt && new Date(t.subscription.expiresAt).getTime() <= horizon && lifecycleOf(t, now) === life)
      .sort((a, b) => new Date(a.subscription!.expiresAt!).getTime() - new Date(b.subscription!.expiresAt!).getTime())
      .map((t) => ({ id: t._id, name: t.displayName || t.name, expiresAt: iso(t.subscription!.expiresAt)! }));
  return {
    metrics: computePlatformMetrics(tenants, now, 6, await getPlanPricing()),
    recentSignups,
    support: { open, waiting, chatsUnread },
    attention: { trialsEnding: endingSoon('trial'), cancelling: endingSoon('cancelling') },
  };
}

// ── Clinics list ──────────────────────────────────────────────────────────────

export interface PlatformTenantListRow {
  id: string;
  name: string;
  subdomain: string;
  plan: string;
  billingCycle: string | null;
  lifecycle: TenantLifecycle;
  mrr: number;
  expiresAt: string | null;
  createdAt: string;
  staff: number;
  lastStaffLogin: string | null;
}

export interface PlatformTenantList {
  rows: PlatformTenantListRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<TenantLifecycle | 'all', number>;
  /** ISO code each row's mrr is in. */
  currency: string;
  /** MRR of every clinic matching the search and state, not just this page. */
  mrrTotal: number;
  asOf: string;
}

export type ClinicSort = 'newest' | 'oldest' | 'name' | 'mrr' | 'ends';
export const CLINIC_SORTS: ClinicSort[] = ['newest', 'oldest', 'name', 'mrr', 'ends'];

export async function loadPlatformTenants(opts: { q?: string; lifecycle?: TenantLifecycle | ''; page?: number; sort?: ClinicSort }): Promise<PlatformTenantList> {
  const now = new Date();
  const pageSize = 25;
  const page = Math.max(1, opts.page ?? 1);
  const pricing = await getPlanPricing();
  let tenants = await allTenants();

  const q = opts.q?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    tenants = tenants.filter((t) => re.test(t.name) || re.test(t.subdomain) || re.test(t.displayName ?? '') || re.test((t as any).email ?? ''));
  }

  const counts = { all: tenants.length, paying: 0, cancelling: 0, trial: 0, 'trial-ended': 0, lapsed: 0, suspended: 0 };
  const withLife = tenants.map((t) => ({ t, life: lifecycleOf(t, now), mrr: monthlyValue(t, now, pricing) }));
  for (const { life } of withLife) counts[life]++;

  const filtered = opts.lifecycle ? withLife.filter((x) => x.life === opts.lifecycle) : withLife;
  type Row = (typeof withLife)[number];
  const created = (x: Row) => new Date(x.t.createdAt).getTime();
  // Period end ascending; clinics without one go last.
  const ends = (x: Row) => (x.t.subscription?.expiresAt ? new Date(x.t.subscription.expiresAt).getTime() : Infinity);
  const name = (x: Row) => (x.t.displayName || x.t.name || '').toLowerCase();
  const order: Record<ClinicSort, (a: Row, b: Row) => number> = {
    newest: (a, b) => created(b) - created(a),
    oldest: (a, b) => created(a) - created(b),
    name: (a, b) => name(a).localeCompare(name(b)),
    mrr: (a, b) => b.mrr - a.mrr || created(b) - created(a),
    ends: (a, b) => ends(a) - ends(b),
  };
  filtered.sort(order[opts.sort ?? 'newest']);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const ids = pageRows.map((x) => new Types.ObjectId(x.t._id));
  const staffAgg = ids.length
    ? await User.aggregate<{ _id: Types.ObjectId; staff: number; lastLogin: Date | null }>([
        { $match: { tenantId: { $in: ids }, status: 'active' } },
        { $group: { _id: '$tenantId', staff: { $sum: 1 }, lastLogin: { $max: '$lastLogin' } } },
      ])
    : [];
  const staffBy = new Map(staffAgg.map((s) => [String(s._id), s]));

  return {
    rows: pageRows.map(({ t, life, mrr }) => ({
      id: t._id,
      name: t.displayName || t.name,
      subdomain: t.subdomain,
      plan: t.subscription?.plan || 'trial',
      billingCycle: t.subscription?.billingCycle ?? null,
      lifecycle: life,
      mrr,
      expiresAt: iso(t.subscription?.expiresAt),
      createdAt: iso(t.createdAt)!,
      staff: staffBy.get(t._id)?.staff ?? 0,
      lastStaffLogin: iso(staffBy.get(t._id)?.lastLogin),
    })),
    total: filtered.length,
    page,
    pageSize,
    counts,
    currency: MRR_CURRENCY,
    mrrTotal: Math.round(filtered.reduce((a, x) => a + x.mrr, 0) * 100) / 100,
    asOf: now.toISOString(),
  };
}

// ── One clinic ────────────────────────────────────────────────────────────────

export interface PlatformTenantDetail {
  id: string;
  name: string;
  displayName: string | null;
  subdomain: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  lifecycle: TenantLifecycle;
  mrr: number;
  mrrCurrency: string;
  subscription: {
    plan: string;
    status: string;
    billingCycle: string | null;
    expiresAt: string | null;
  };
  payments: Array<{
    transactionId: string;
    amount: number;
    currency: string;
    plan: string;
    billingCycle: string;
    status: string;
    paidAt: string;
    /** DevCom Digital's sales invoice for it: issued, cancelled, or waiting (held, with why). */
    invoice: { id: string; serialNo: string | null; status: string; heldReason: string | null; emailedAt: string | null } | null;
  }>;
  usage: {
    staff: number;
    patients: number;
    appointments30d: number;
    /** Appointments by the week they're for, the last ACTIVITY_WEEKS weeks (Monday starts), oldest first. */
    appointmentsByWeek: Array<{ weekStart: string; count: number }>;
  };
  /** Share of the current trial or paid period used, 0–1: from sign-up or the latest completed payment to expiresAt. */
  periodProgress: number | null;
  /** Completed payments, summed per currency. */
  lifetimeRevenue: Array<{ currency: string; amount: number }>;
  admins: Array<{ id: string; name: string; email: string; lastLogin: string | null }>;
  tickets: Array<{ id: string; subject: string; status: SupportStatus; lastActivityAt: string }>;
}

export const ACTIVITY_WEEKS = 12;

/** UTC midnight on the Monday of d's week. */
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

export async function loadPlatformTenant(id: string): Promise<PlatformTenantDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const t = await Tenant.findById(id).select(TENANT_FIELDS).lean<any>();
  if (!t) return null;
  const now = new Date();
  const row: PlatformTenantRow = { ...t, _id: String(t._id) };
  const tenantId = new Types.ObjectId(id);

  const Patient = (await import('@/models/Patient')).default;
  const Appointment = (await import('@/models/Appointment')).default;
  const Role = (await import('@/models/Role')).default;
  const adminRoles = await Role.find({ tenantId, name: { $in: ['admin', 'owner'] } }).select('_id').lean<{ _id: Types.ObjectId }[]>();

  const thisWeek = weekStart(now);
  const firstWeek = new Date(thisWeek.getTime() - (ACTIVITY_WEEKS - 1) * 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(thisWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [staff, patients, appointments30d, admins, tickets, invoices, weekly] = await Promise.all([
    User.countDocuments({ tenantId, status: 'active' }),
    Patient.countDocuments({ tenantIds: tenantId }),
    Appointment.countDocuments({ tenantId, createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }),
    User.find({ tenantId, status: 'active', role: { $in: adminRoles.map((r) => r._id) } })
      .select('name email lastLogin')
      .sort({ createdAt: 1 })
      .limit(10)
      .lean<any[]>(),
    SupportRequest.find({ tenantId }).select('subject status lastActivityAt createdAt').sort({ createdAt: -1 }).limit(10).lean<any[]>(),
    PlatformInvoice.find({ tenantId }).select('orderId serialNo status heldReason emailedAt').lean<any[]>(),
    // Older appointments carry appointmentDate, newer ones scheduledAt; either can be set.
    Appointment.aggregate<{ _id: Date; count: number }>([
      {
        $match: {
          tenantId,
          $or: [{ appointmentDate: { $gte: firstWeek, $lt: weekEnd } }, { scheduledAt: { $gte: firstWeek, $lt: weekEnd } }],
        },
      },
      { $project: { when: { $ifNull: ['$appointmentDate', '$scheduledAt'] } } },
      { $match: { when: { $gte: firstWeek, $lt: weekEnd } } },
      { $group: { _id: { $dateTrunc: { date: '$when', unit: 'week', startOfWeek: 'monday', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
  ]);
  const weekCounts = new Map(weekly.map((w) => [new Date(w._id).toISOString(), w.count]));
  const appointmentsByWeek = Array.from({ length: ACTIVITY_WEEKS }, (_, i) => {
    const ws = new Date(firstWeek.getTime() + i * 7 * 24 * 60 * 60 * 1000).toISOString();
    return { weekStart: ws, count: weekCounts.get(ws) ?? 0 };
  });
  const completed = (t.subscription?.paymentHistory ?? []).filter((p: any) => (p.status ?? 'completed') === 'completed');
  const revenueBy = new Map<string, number>();
  for (const p of completed) {
    const cur = (p.currency || 'USD').toUpperCase();
    revenueBy.set(cur, (revenueBy.get(cur) ?? 0) + (Number(p.amount) || 0));
  }
  const lastPaid = completed.reduce((m: Date | null, p: any) => (!m || new Date(p.paidAt) > m ? new Date(p.paidAt) : m), null);
  const invoiceByOrder = new Map(invoices.map((inv) => [inv.orderId, inv]));

  return {
    id,
    name: t.name,
    displayName: t.displayName ?? null,
    subdomain: t.subdomain,
    email: t.email ?? null,
    phone: t.phone ?? null,
    status: t.status,
    createdAt: iso(t.createdAt)!,
    lifecycle: lifecycleOf(row, now),
    mrr: monthlyValue(row, now, await getPlanPricing()),
    mrrCurrency: MRR_CURRENCY,
    subscription: {
      plan: t.subscription?.plan || 'trial',
      status: t.subscription?.status || 'active',
      billingCycle: t.subscription?.billingCycle ?? null,
      expiresAt: iso(t.subscription?.expiresAt),
    },
    payments: [...(t.subscription?.paymentHistory ?? [])]
      .sort((a: any, b: any) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .map((p: any) => ({
        transactionId: p.transactionId,
        amount: p.amount,
        currency: p.currency || 'USD',
        plan: p.plan,
        billingCycle: p.billingCycle,
        status: p.status || 'completed',
        paidAt: iso(p.paidAt)!,
        invoice: (() => {
          const inv = invoiceByOrder.get(p.orderId);
          return inv
            ? { id: String(inv._id), serialNo: inv.serialNo ?? null, status: inv.status, heldReason: inv.heldReason ?? null, emailedAt: iso(inv.emailedAt) }
            : null;
        })(),
      })),
    usage: { staff, patients, appointments30d, appointmentsByWeek },
    periodProgress: (() => {
      // A paid plan with no payment on record was set by hand: there's no start to measure from.
      const start = isPaidPlan(t.subscription?.plan) ? lastPaid : new Date(t.createdAt);
      const end = t.subscription?.expiresAt ? new Date(t.subscription.expiresAt) : null;
      if (!start || !end || end <= start) return null;
      return Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())));
    })(),
    lifetimeRevenue: [...revenueBy.entries()].sort((a, b) => b[1] - a[1]).map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
    admins: admins.map((u) => ({ id: String(u._id), name: u.name, email: u.email, lastLogin: iso(u.lastLogin) })),
    tickets: tickets.map((s) => ({ id: String(s._id), subject: s.subject, status: s.status, lastActivityAt: iso(s.lastActivityAt ?? s.createdAt)! })),
  };
}

// ── Support queue ─────────────────────────────────────────────────────────────

export type QueueView = 'waiting' | 'open' | 'resolved' | 'all';

export interface SupportQueueRow {
  id: string;
  reference: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  email: string;
  clinic: { id: string; name: string } | null;
  source: 'clinic' | 'medical-rep';
  replies: number;
  lastReplyBy: SupportReplyAuthor;
  lastActivityAt: string;
  createdAt: string;
}

const QUEUE_FILTER: Record<QueueView, Record<string, unknown>> = {
  waiting: { status: { $in: ['open', 'in-progress'] }, lastReplyBy: { $ne: 'platform' } },
  open: { status: { $in: ['open', 'in-progress'] } },
  resolved: { status: { $in: ['resolved', 'closed'] } },
  all: {},
};

export const supportReference = (id: string) => `SR-${id.slice(-6).toUpperCase()}`;

function toQueueRow(s: any, names: Map<string, string>): SupportQueueRow {
  const tid = s.tenantId ? String(s.tenantId) : null;
  return {
    id: String(s._id),
    reference: supportReference(String(s._id)),
    subject: s.subject,
    category: s.category,
    status: s.status,
    email: s.email,
    clinic: tid ? { id: tid, name: names.get(tid) ?? 'Unknown clinic' } : null,
    source: s.source ?? 'medical-rep',
    replies: s.replies?.length ?? 0,
    lastReplyBy: s.lastReplyBy ?? 'requester',
    lastActivityAt: iso(s.lastActivityAt ?? s.createdAt)!,
    createdAt: iso(s.createdAt)!,
  };
}

async function tenantNames(ids: unknown[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const rows = await Tenant.find({ _id: { $in: unique } }).select('name displayName').lean<any[]>();
  return new Map(rows.map((t) => [String(t._id), t.displayName || t.name]));
}

/** How long the oldest-waiting requests have sat since the requester last wrote. Upper bounds in hours. */
export const WAIT_BUCKETS = [
  { key: 'h4', label: 'Under 4 hours', maxHours: 4 },
  { key: 'd1', label: '4–24 hours', maxHours: 24 },
  { key: 'd3', label: '1–3 days', maxHours: 72 },
  { key: 'old', label: 'Over 3 days', maxHours: Infinity },
] as const;
export const SUPPORT_WEEKS = 12;
/** First replies are measured on requests opened in this many days. */
export const FIRST_REPLY_DAYS = 30;

export interface SupportQueueStats {
  asOf: string;
  /** Waiting-on-us requests per WAIT_BUCKETS entry, same order. */
  waitAges: number[];
  oldestWaiting: { id: string; subject: string; since: string } | null;
  openByCategory: Array<{ category: SupportCategory; count: number }>;
  openBySource: { clinic: number; rep: number };
  /** Requests opened per week (Monday starts), oldest first. */
  openedByWeek: Array<{ weekStart: string; count: number }>;
  /** Over requests opened in the last FIRST_REPLY_DAYS days. */
  firstReply: { medianHours: number | null; answered: number; unanswered: number };
}

const HOUR = 60 * 60 * 1000;

async function loadSupportStats(now: Date): Promise<SupportQueueStats> {
  const firstWeek = new Date(weekStart(now).getTime() - (SUPPORT_WEEKS - 1) * 7 * 24 * HOUR);
  const replySince = new Date(now.getTime() - FIRST_REPLY_DAYS * 24 * HOUR);
  const since = firstWeek < replySince ? firstWeek : replySince;
  const [openDocs, recent] = await Promise.all([
    // Uses the { status, lastActivityAt } index; the open set stays small.
    SupportRequest.find(QUEUE_FILTER.open)
      .select('subject category source lastReplyBy lastActivityAt createdAt')
      .lean<any[]>(),
    // Requests are a small collection; there's no createdAt-led index, so this scans it.
    SupportRequest.aggregate<{ createdAt: Date; firstReplyAt: Date | null }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $project: {
          _id: 0,
          createdAt: 1,
          firstReplyAt: {
            $min: {
              $map: {
                input: { $filter: { input: { $ifNull: ['$replies', []] }, as: 'r', cond: { $eq: ['$$r.authorType', 'platform'] } } },
                as: 'r',
                in: '$$r.createdAt',
              },
            },
          },
        },
      },
    ]),
  ]);

  const waitAges = WAIT_BUCKETS.map(() => 0);
  let oldest: any = null;
  const cats = new Map<SupportCategory, number>();
  const openBySource = { clinic: 0, rep: 0 };
  for (const d of openDocs) {
    cats.set(d.category, (cats.get(d.category) ?? 0) + 1);
    if (d.source === 'clinic') openBySource.clinic++;
    else openBySource.rep++;
    if (d.lastReplyBy === 'platform') continue;
    const at = new Date(d.lastActivityAt ?? d.createdAt);
    const hours = (now.getTime() - at.getTime()) / HOUR;
    waitAges[WAIT_BUCKETS.findIndex((b) => hours < b.maxHours)]++;
    if (!oldest || at < new Date(oldest.lastActivityAt ?? oldest.createdAt)) oldest = d;
  }

  const weekCounts = new Map<string, number>();
  const replyHours: number[] = [];
  let unanswered = 0;
  for (const r of recent) {
    const created = new Date(r.createdAt);
    if (created >= firstWeek) {
      const ws = weekStart(created).toISOString();
      weekCounts.set(ws, (weekCounts.get(ws) ?? 0) + 1);
    }
    if (created >= replySince) {
      if (r.firstReplyAt) replyHours.push((new Date(r.firstReplyAt).getTime() - created.getTime()) / HOUR);
      else unanswered++;
    }
  }
  replyHours.sort((a, b) => a - b);
  const mid = replyHours.length >> 1;
  const medianHours = !replyHours.length
    ? null
    : replyHours.length % 2
      ? replyHours[mid]
      : (replyHours[mid - 1] + replyHours[mid]) / 2;

  return {
    asOf: now.toISOString(),
    waitAges,
    oldestWaiting: oldest
      ? { id: String(oldest._id), subject: oldest.subject, since: iso(oldest.lastActivityAt ?? oldest.createdAt)! }
      : null,
    openByCategory: [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
    openBySource,
    openedByWeek: Array.from({ length: SUPPORT_WEEKS }, (_, i) => {
      const ws = new Date(firstWeek.getTime() + i * 7 * 24 * HOUR).toISOString();
      return { weekStart: ws, count: weekCounts.get(ws) ?? 0 };
    }),
    firstReply: { medianHours, answered: replyHours.length, unanswered },
  };
}

/** Subject or email contains q, or q is a reference like SR-3F9A2C. */
function queueSearch(q: string): Record<string, unknown> | null {
  const term = q.trim();
  if (!term) return null;
  const ref = /^sr-?([0-9a-f]{6})$/i.exec(term);
  if (ref) {
    return { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: `${ref[1].toLowerCase()}$` } } };
  }
  const re = new RegExp(escapeRegex(term), 'i');
  return { $or: [{ subject: re }, { email: re }] };
}

export async function loadSupportQueue(opts: { view: QueueView; page?: number; q?: string }) {
  await connectDB();
  const pageSize = 30;
  const page = Math.max(1, opts.page ?? 1);
  const search = queueSearch(opts.q ?? '');
  const filter = search ? { $and: [QUEUE_FILTER[opts.view], search] } : QUEUE_FILTER[opts.view];
  const [docs, total, waiting, open, stats] = await Promise.all([
    SupportRequest.find(filter)
      .select('-message -replies.message')
      .sort({ lastActivityAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<any[]>(),
    SupportRequest.countDocuments(filter),
    SupportRequest.countDocuments(QUEUE_FILTER.waiting),
    SupportRequest.countDocuments(QUEUE_FILTER.open),
    loadSupportStats(new Date()),
  ]);
  const names = await tenantNames(docs.map((d) => d.tenantId));
  return { rows: docs.map((d) => toQueueRow(d, names)), total, page, pageSize, counts: { waiting, open }, stats };
}

export interface SupportTicketDetail extends SupportQueueRow {
  thread: Array<{ id: string; authorType: SupportReplyAuthor; authorEmail: string; message: string; createdAt: string }>;
}

export async function loadSupportTicket(id: string, tenantId?: string): Promise<SupportTicketDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const filter: Record<string, unknown> = { _id: id };
  if (tenantId) filter.tenantId = new Types.ObjectId(tenantId);
  const s = await SupportRequest.findOne(filter).lean<any>();
  if (!s) return null;
  const names = await tenantNames([s.tenantId]);
  return {
    ...toQueueRow(s, names),
    thread: [
      { id: `${s._id}-0`, authorType: 'requester', authorEmail: s.email, message: s.message, createdAt: iso(s.createdAt)! },
      ...(s.replies ?? []).map((r: any) => ({
        id: String(r._id),
        authorType: r.authorType,
        authorEmail: r.authorEmail,
        message: r.message,
        createdAt: iso(r.createdAt)!,
      })),
    ],
  };
}

// ── Rep referrals ─────────────────────────────────────────────────────────────

export const REFERRAL_MONTHS = 12;

export interface ReferralOverview {
  asOf: string;
  currency: string;
  /** Clinics linked to a rep through a referral code. */
  referred: number;
  byLifecycle: Record<TenantLifecycle, number>;
  /** What the referred clinics that pay bring in each month. */
  referredMrr: number;
  /** Referred clinics per month of linking (UTC), the last REFERRAL_MONTHS months, oldest first. */
  byMonth: Array<{ month: string; count: number }>;
  topReps: Array<{ id: string; name: string; company: string | null; clinics: number; paying: number }>;
  recent: Array<{ clinicId: string; clinicName: string; code: string; rep: { id: string; name: string }; at: string; lifecycle: TenantLifecycle }>;
}

export async function loadReferralOverview(): Promise<ReferralOverview> {
  await connectDB();
  const now = new Date();
  // The partial { 'referral.repId', createdAt } index holds exactly these clinics.
  const [rows, pricing] = await Promise.all([
    Tenant.find({ 'referral.repId': { $exists: true } }).select(`${TENANT_FIELDS} referral`).lean<any[]>(),
    getPlanPricing(),
  ]);

  const byLifecycle: Record<TenantLifecycle, number> = { paying: 0, cancelling: 0, trial: 0, 'trial-ended': 0, lapsed: 0, suspended: 0 };
  const monthKeys: string[] = [];
  for (let i = REFERRAL_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const monthCounts = new Map<string, number>();
  const reps = new Map<string, { clinics: number; paying: number }>();
  let referredMrr = 0;
  const enriched = rows.map((t) => {
    const row = { ...t, _id: String(t._id) } as PlatformTenantRow;
    const life = lifecycleOf(row, now);
    byLifecycle[life]++;
    if (life === 'paying' || life === 'cancelling') referredMrr += monthlyValue(row, now, pricing);
    const at = new Date(t.referral?.at ?? t.createdAt);
    const key = at.toISOString().slice(0, 7);
    monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
    const rid = String(t.referral.repId);
    const r = reps.get(rid) ?? { clinics: 0, paying: 0 };
    r.clinics++;
    if (life === 'paying' || life === 'cancelling') r.paying++;
    reps.set(rid, r);
    return { t, life, at };
  });

  const recent = enriched.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
  const top = [...reps.entries()].sort((a, b) => b[1].clinics - a[1].clinics || b[1].paying - a[1].paying).slice(0, 6);
  const repIds = [...new Set([...top.map(([id]) => id), ...recent.map((e) => String(e.t.referral.repId))])];
  const repDocs = await MedicalRepresentative.find({ _id: { $in: repIds } }).select('firstName lastName company').lean<any[]>();
  const repById = new Map(repDocs.map((r) => [String(r._id), r]));
  const repName = (id: string) => {
    const r = repById.get(id);
    return r ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Unnamed rep' : 'Removed rep';
  };

  return {
    asOf: now.toISOString(),
    currency: MRR_CURRENCY,
    referred: rows.length,
    byLifecycle,
    referredMrr,
    byMonth: monthKeys.map((month) => ({ month, count: monthCounts.get(month) ?? 0 })),
    topReps: top.map(([id, v]) => ({ id, name: repName(id), company: repById.get(id)?.company || null, ...v })),
    recent: recent.map(({ t, life, at }) => ({
      clinicId: String(t._id),
      clinicName: t.displayName || t.name,
      code: t.referral.code,
      rep: { id: String(t.referral.repId), name: repName(String(t.referral.repId)) },
      at: at.toISOString(),
      lifecycle: life,
    })),
  };
}

// ── Announcements (Notify) ────────────────────────────────────────────────────

export interface AnnouncementRow {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'high' | 'urgent';
  audience: 'admins' | 'all-staff';
  /** Named clinics, or empty for every active clinic. */
  clinicNames: string[];
  actionUrl: string | null;
  sentByEmail: string;
  clinics: number;
  recipients: number;
  /** Recipients who opened it; null for notices sent before reads were tracked. */
  read: number | null;
  createdAt: string;
}

export const ANNOUNCEMENT_WINDOW_DAYS = 30;

export async function loadAnnouncements(limit = 30): Promise<{
  rows: AnnouncementRow[];
  window: { sent: number; reached: number; read: number; tracked: number };
}> {
  await connectDB();
  const since = new Date(Date.now() - ANNOUNCEMENT_WINDOW_DAYS * 86_400_000);
  const [docs, windowAgg] = await Promise.all([
    PlatformAnnouncement.find({}).sort({ createdAt: -1 }).limit(limit).lean<any[]>(),
    PlatformAnnouncement.aggregate<{ sent: number; reached: number; ids: Types.ObjectId[] }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, sent: { $sum: 1 }, reached: { $sum: '$recipients' }, ids: { $push: '$_id' } } },
    ]),
  ]);
  const windowIds = (windowAgg[0]?.ids ?? []).map(String);
  const ids = [...new Set([...docs.map((d) => String(d._id)), ...windowIds])];
  // Uses the partial { metadata.announcementId, read } index.
  const [reads, names] = await Promise.all([
    ids.length
      ? Notification.aggregate<{ _id: string; total: number; read: number }>([
          { $match: { 'metadata.announcementId': { $in: ids } } },
          { $group: { _id: '$metadata.announcementId', total: { $sum: 1 }, read: { $sum: { $cond: ['$read', 1, 0] } } } },
        ])
      : [],
    tenantNames(docs.flatMap((d) => d.tenantIds ?? [])),
  ]);
  const readById = new Map(reads.map((r) => [String(r._id), r]));

  let windowRead = 0;
  let windowTracked = 0;
  for (const id of windowIds) {
    const r = readById.get(id);
    if (r) {
      windowRead += r.read;
      windowTracked += r.total;
    }
  }

  return {
    rows: docs.map((d) => {
      const r = readById.get(String(d._id));
      return {
        id: String(d._id),
        title: d.title,
        message: d.message,
        priority: d.priority ?? 'normal',
        audience: d.audience,
        clinicNames: (d.tenantIds ?? []).map((id: unknown) => names.get(String(id)) ?? 'a removed clinic'),
        actionUrl: d.actionUrl ?? null,
        sentByEmail: d.sentByEmail,
        clinics: d.clinics ?? 0,
        recipients: d.recipients ?? 0,
        read: r ? r.read : null,
        createdAt: iso(d.createdAt)!,
      };
    }),
    window: { sent: windowAgg[0]?.sent ?? 0, reached: windowAgg[0]?.reached ?? 0, read: windowRead, tracked: windowTracked },
  };
}
