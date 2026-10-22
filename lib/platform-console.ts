import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import SupportRequest, { type SupportStatus, type SupportCategory, type SupportReplyAuthor } from '@/models/SupportRequest';
import { escapeRegex } from '@/lib/api/validate';
import { getPlanPricing } from '@/lib/platform-config';
import PlatformInvoice from '@/models/PlatformInvoice';
import {
  computePlatformMetrics,
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
  support: { open: number; waiting: number };
}

export async function loadPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const tenants = await allTenants();
  const [open, waiting] = await Promise.all([
    SupportRequest.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
    SupportRequest.countDocuments({ status: { $in: ['open', 'in-progress'] }, lastReplyBy: { $ne: 'platform' } }),
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
  return { metrics: computePlatformMetrics(tenants, now, 6, await getPlanPricing()), recentSignups, support: { open, waiting } };
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
}

export async function loadPlatformTenants(opts: { q?: string; lifecycle?: TenantLifecycle | ''; page?: number }): Promise<PlatformTenantList> {
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
  const withLife = tenants.map((t) => ({ t, life: lifecycleOf(t, now) }));
  for (const { life } of withLife) counts[life]++;

  const filtered = opts.lifecycle ? withLife.filter((x) => x.life === opts.lifecycle) : withLife;
  filtered.sort((a, b) => new Date(b.t.createdAt).getTime() - new Date(a.t.createdAt).getTime());
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
    rows: pageRows.map(({ t, life }) => ({
      id: t._id,
      name: t.displayName || t.name,
      subdomain: t.subdomain,
      plan: t.subscription?.plan || 'trial',
      billingCycle: t.subscription?.billingCycle ?? null,
      lifecycle: life,
      mrr: monthlyValue(t, now, pricing),
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
  usage: { staff: number; patients: number; appointments30d: number };
  admins: Array<{ id: string; name: string; email: string; lastLogin: string | null }>;
  tickets: Array<{ id: string; subject: string; status: SupportStatus; lastActivityAt: string }>;
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

  const [staff, patients, appointments30d, admins, tickets, invoices] = await Promise.all([
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
  ]);
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
    usage: { staff, patients, appointments30d },
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

export async function loadSupportQueue(opts: { view: QueueView; page?: number }) {
  await connectDB();
  const pageSize = 30;
  const page = Math.max(1, opts.page ?? 1);
  const filter = QUEUE_FILTER[opts.view];
  const [docs, total, waiting, open] = await Promise.all([
    SupportRequest.find(filter)
      .select('-message -replies.message')
      .sort({ lastActivityAt: -1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean<any[]>(),
    SupportRequest.countDocuments(filter),
    SupportRequest.countDocuments(QUEUE_FILTER.waiting),
    SupportRequest.countDocuments(QUEUE_FILTER.open),
  ]);
  const names = await tenantNames(docs.map((d) => d.tenantId));
  return { rows: docs.map((d) => toQueueRow(d, names)), total, page, pageSize, counts: { waiting, open } };
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
