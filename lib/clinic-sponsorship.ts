import 'server-only';
import { randomBytes } from 'crypto';
import { Types, type Document } from 'mongoose';
import { addDays } from 'date-fns';
import connectDB from '@/lib/mongodb';
import ClinicSponsorship, { OPEN_SPONSORSHIP_STATUSES, type IClinicSponsorship } from '@/models/ClinicSponsorship';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import SubscriptionOrder from '@/models/SubscriptionOrder';
import Tenant from '@/models/Tenant';
import { getSponsorshipPricing } from '@/lib/platform-config';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { activateSubscriptionFromOrder } from '@/lib/subscription';
import { notifyStaff } from '@/lib/notify';
import { sendPushToUserDevices } from '@/lib/push-notifications';
import {
  SPONSORED_PLAN,
  isSponsorTerm,
  sponsorshipPrice,
  sponsorshipQuotes,
  termLabel,
  type SponsorTerm,
  type SponsorshipQuote,
} from '@/lib/sponsorship-pricing';

/**
 * A medical rep paying for a clinic's subscription (models/ClinicSponsorship.ts).
 *
 *  1. Either side asks: the clinic asks one of its linked reps, or a rep offers to a clinic it is
 *     linked to (MedicalRepresentative.tenantIds). A clinic has one open sponsorship at a time.
 *  2. The other side accepts or declines.
 *  3. The rep pays for 1, 3, 6 or 12 months (lib/sponsorship-pricing.ts) through PayMongo. The
 *     payment goes through the clinic's normal subscription path (activateSubscriptionFromOrder):
 *     the clinic gets the Professional plan, extended from the end of anything already paid.
 *     Paying again while accepted renews it.
 *  4. Either side can end it; time already paid for stays with the clinic.
 */

export type Side = 'clinic' | 'rep';
export type Actor = { side: 'clinic'; tenantId: string; userId: string } | { side: 'rep'; userId: string };

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code?: string };
const fail = (status: number, error: string, code?: string): { ok: false; status: number; error: string; code?: string } => ({ ok: false, status, error, code });

const oid = (v: string | Types.ObjectId) => (typeof v === 'string' ? new Types.ObjectId(v) : v);
const isOid = (v: unknown): v is string => typeof v === 'string' && Types.ObjectId.isValid(v);

/** Days before the paid period ends that the rep is reminded to renew. */
export const RENEWAL_REMINDER_DAYS = 7;

export interface SponsorshipPrices {
  quotes: SponsorshipQuote[];
  monthly: number;
  plan: typeof SPONSORED_PLAN;
  currency: 'PHP';
  /** Online payment is set up, so a rep can pay now. */
  payable: boolean;
}

export async function getSponsorshipPrices(): Promise<SponsorshipPrices> {
  const [pricing, payable] = await Promise.all([getSponsorshipPricing(), isPayMongoConfigured()]);
  return { quotes: sponsorshipQuotes(pricing), monthly: pricing.monthly, plan: SPONSORED_PLAN, currency: 'PHP', payable };
}

// ── What each side sees ──────────────────────────────────────────────────────

export interface SponsorshipView {
  id: string;
  status: IClinicSponsorship['status'];
  initiatedBy: Side;
  /** The caller's side has to accept or decline it. */
  awaitingYou: boolean;
  message: string | null;
  clinic: { id: string; name: string };
  rep: { id: string; name: string; company: string | null };
  paidThrough: string | null;
  /** The sponsorship has paid for time that hasn't run out yet. */
  active: boolean;
  payments: { months: number; amount: number; paidAt: string; refunded: boolean }[];
  createdAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  endedBy: Side | null;
}

type Lean = Omit<IClinicSponsorship, keyof Document> & { _id: Types.ObjectId };

async function toViews(rows: Lean[], side: Side, now = new Date()): Promise<SponsorshipView[]> {
  if (!rows.length) return [];
  const [tenants, reps] = await Promise.all([
    Tenant.find({ _id: { $in: rows.map((r) => r.tenantId) } }).select('name displayName').lean<any[]>(),
    MedicalRepresentative.find({ _id: { $in: rows.map((r) => r.repId) } }).select('firstName lastName company').lean<any[]>(),
  ]);
  const tName = new Map(tenants.map((t) => [String(t._id), t.displayName || t.name || 'Clinic']));
  const rInfo = new Map(reps.map((r) => [String(r._id), r]));
  return rows.map((s) => {
    const rep = rInfo.get(String(s.repId));
    return {
      id: String(s._id),
      status: s.status,
      initiatedBy: s.initiatedBy,
      awaitingYou: s.status === 'pending' && s.initiatedBy !== side,
      message: s.message ?? null,
      clinic: { id: String(s.tenantId), name: tName.get(String(s.tenantId)) ?? 'Clinic' },
      rep: {
        id: String(s.repId),
        name: rep ? `${rep.firstName} ${rep.lastName}`.trim() : 'Medical representative',
        company: rep?.company || null,
      },
      paidThrough: s.paidThrough ? new Date(s.paidThrough).toISOString() : null,
      active: !!s.paidThrough && new Date(s.paidThrough) > now,
      payments: (s.payments ?? []).map((p) => ({ months: p.months, amount: p.amount, paidAt: new Date(p.paidAt).toISOString(), refunded: !!p.refundedAt })),
      createdAt: new Date(s.createdAt).toISOString(),
      respondedAt: s.respondedAt ? new Date(s.respondedAt).toISOString() : null,
      endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
      endedBy: s.endedBy ?? null,
    };
  });
}

/** The rep's sponsorships, newest first (open ones and the last 50 closed). */
export async function listRepSponsorships(repUserId: string): Promise<SponsorshipView[]> {
  await connectDB();
  const rows = await ClinicSponsorship.find({ repUserId: oid(repUserId) }).sort({ createdAt: -1 }).limit(100).lean<Lean[]>();
  return toViews(rows, 'rep');
}

/**
 * Clinics the rep could offer to sponsor: the active clinics they are linked to that have no open
 * sponsorship (from this rep or another).
 */
export async function sponsorableClinics(repUserId: string): Promise<{ id: string; name: string }[]> {
  await connectDB();
  const rep = await MedicalRepresentative.findOne({ userId: oid(repUserId) }).select('tenantIds').lean<{ tenantIds?: Types.ObjectId[] } | null>();
  const ids = rep?.tenantIds ?? [];
  if (!ids.length) return [];
  const [tenants, open] = await Promise.all([
    Tenant.find({ _id: { $in: ids }, status: 'active' }).select('name displayName').sort({ name: 1 }).limit(200).lean<any[]>(),
    ClinicSponsorship.find({ tenantId: { $in: ids }, status: { $in: OPEN_SPONSORSHIP_STATUSES } }).select('tenantId').lean<{ tenantId: Types.ObjectId }[]>(),
  ]);
  const taken = new Set(open.map((s) => String(s.tenantId)));
  return tenants.filter((t) => !taken.has(String(t._id))).map((t) => ({ id: String(t._id), name: t.displayName || t.name || 'Clinic' }));
}

export interface ClinicSponsorshipPage {
  /** The open sponsorship (pending or accepted), if any. */
  current: SponsorshipView | null;
  /** Earlier ones, newest first. */
  history: SponsorshipView[];
  /** Linked, active reps the clinic could ask. */
  reps: { id: string; name: string; company: string | null }[];
  prices: SponsorshipPrices;
}

export async function loadClinicSponsorship(tenantId: string): Promise<ClinicSponsorshipPage> {
  await connectDB();
  const tid = oid(tenantId);
  const [rows, reps, prices] = await Promise.all([
    ClinicSponsorship.find({ tenantId: tid }).sort({ createdAt: -1 }).limit(20).lean<Lean[]>(),
    MedicalRepresentative.find({ tenantIds: tid, isActivated: true, status: 'active' })
      .select('firstName lastName company')
      .sort({ lastName: 1, firstName: 1 })
      .limit(200)
      .lean<any[]>(),
    getSponsorshipPrices(),
  ]);
  const views = await toViews(rows, 'clinic');
  const current = views.find((v) => (OPEN_SPONSORSHIP_STATUSES as string[]).includes(v.status)) ?? null;
  return {
    current,
    history: views.filter((v) => v !== current),
    reps: reps.map((r) => ({ id: String(r._id), name: `${r.firstName} ${r.lastName}`.trim(), company: r.company || null })),
    prices,
  };
}

// ── Asking, answering, ending ────────────────────────────────────────────────

/** Ask for (clinic) or offer (rep) a sponsorship. The rep must be linked to the clinic. */
export async function requestSponsorship(opts: {
  tenantId: string;
  repId: string;
  by: Side;
  userId: string;
  message?: string;
}): Promise<Result<SponsorshipView>> {
  if (!isOid(opts.tenantId) || !isOid(opts.repId)) return fail(400, 'Unknown clinic or representative');
  await connectDB();
  const tid = oid(opts.tenantId);
  const [tenant, rep] = await Promise.all([
    Tenant.findOne({ _id: tid, status: 'active' }).select('name displayName').lean<any>(),
    MedicalRepresentative.findById(opts.repId).select('userId tenantIds isActivated status firstName lastName company').lean<any>(),
  ]);
  if (!tenant) return fail(404, 'Clinic not found');
  if (!rep || !rep.userId) return fail(404, 'Medical representative not found');
  // A rep acting for themselves must be the rep named.
  if (opts.by === 'rep' && String(rep.userId) !== opts.userId) return fail(403, 'Forbidden');
  if (!rep.isActivated || rep.status !== 'active') return fail(409, 'This representative’s account isn’t active.', 'REP_INACTIVE');
  if (!(rep.tenantIds ?? []).some((t: Types.ObjectId) => String(t) === opts.tenantId)) {
    return fail(
      409,
      opts.by === 'rep'
        ? 'You can only sponsor clinics you work with. Ask the clinic to add you, or book a visit first.'
        : 'This representative isn’t linked to your clinic.',
      'NOT_LINKED'
    );
  }

  try {
    const created = await ClinicSponsorship.create({
      tenantId: tid,
      repId: rep._id,
      repUserId: rep.userId,
      initiatedBy: opts.by,
      initiatedByUserId: oid(opts.userId),
      message: opts.message?.trim() || undefined,
      status: 'pending',
    });
    const [view] = await toViews([created.toObject() as Lean], opts.by);
    await notifyOther(view, opts.by, 'requested', created.message);
    return { ok: true, data: view };
  } catch (error: any) {
    if (error?.code === 11000) {
      return fail(409, 'This clinic already has a sponsorship open. It has to be ended or declined first.', 'ALREADY_OPEN');
    }
    throw error;
  }
}

function ownFilter(id: string, actor: Actor): Record<string, unknown> {
  return actor.side === 'clinic' ? { _id: oid(id), tenantId: oid(actor.tenantId) } : { _id: oid(id), repUserId: oid(actor.userId) };
}

/** Accept or decline a pending sponsorship; only the side that didn't start it may. */
export async function respondToSponsorship(id: string, actor: Actor, action: 'accept' | 'decline'): Promise<Result<SponsorshipView>> {
  if (!isOid(id)) return fail(404, 'Sponsorship not found');
  await connectDB();
  const now = new Date();
  const updated = await ClinicSponsorship.findOneAndUpdate(
    { ...ownFilter(id, actor), status: 'pending', initiatedBy: { $ne: actor.side } },
    { $set: { status: action === 'accept' ? 'accepted' : 'declined', respondedAt: now, respondedBy: oid(actor.userId) } },
    { new: true }
  ).lean<Lean>();
  if (!updated) return notFoundOrConflict(id, actor, 'It isn’t waiting for your answer.');
  const [view] = await toViews([updated], actor.side);
  await notifyOther(view, actor.side, action === 'accept' ? 'accepted' : 'declined');
  return { ok: true, data: view };
}

/**
 * Cancel a pending sponsorship (either side), or end an accepted one. Ending stops further
 * payments; the clinic keeps the time already paid for.
 */
export async function endSponsorship(id: string, actor: Actor): Promise<Result<SponsorshipView>> {
  if (!isOid(id)) return fail(404, 'Sponsorship not found');
  await connectDB();
  const current = await ClinicSponsorship.findOne(ownFilter(id, actor)).select('status').lean<{ status: string } | null>();
  if (!current) return fail(404, 'Sponsorship not found');
  if (!(OPEN_SPONSORSHIP_STATUSES as string[]).includes(current.status)) return fail(409, 'This sponsorship is already closed.', 'CLOSED');
  const next = current.status === 'pending' ? 'cancelled' : 'ended';
  const updated = await ClinicSponsorship.findOneAndUpdate(
    { ...ownFilter(id, actor), status: current.status },
    { $set: { status: next, endedAt: new Date(), endedBy: actor.side } },
    { new: true }
  ).lean<Lean>();
  if (!updated) return fail(409, 'The sponsorship changed meanwhile. Refresh and try again.', 'CHANGED');
  if (next === 'ended') {
    // The plan keeps its paid time but no longer names this rep as its sponsor.
    await Tenant.updateOne({ _id: updated.tenantId, 'subscription.sponsor.sponsorshipId': updated._id }, { $unset: { 'subscription.sponsor': 1 } });
  }
  const [view] = await toViews([updated], actor.side);
  await notifyOther(view, actor.side, next === 'cancelled' ? 'cancelled' : 'ended');
  return { ok: true, data: view };
}

async function notFoundOrConflict(id: string, actor: Actor, conflict: string): Promise<{ ok: false; status: number; error: string; code?: string }> {
  const exists = await ClinicSponsorship.exists(ownFilter(id, actor));
  return exists ? fail(409, conflict, 'NOT_PENDING') : fail(404, 'Sponsorship not found');
}

// ── Paying ───────────────────────────────────────────────────────────────────

function returnUrl(status: 'paid' | 'cancelled') {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `${base}/medical-representatives/paid?status=${status}&for=sponsorship`;
}

/**
 * A PayMongo checkout for `months` of the clinic's plan, paid by the sponsoring rep. Only on an
 * accepted sponsorship. The amount is fixed now and kept on the order.
 */
export async function createSponsorshipCheckout(
  id: string,
  repUserId: string,
  months: unknown
): Promise<Result<{ checkoutUrl: string; orderId: string; amount: number; months: SponsorTerm }>> {
  if (!isSponsorTerm(months)) return fail(400, 'Choose 1, 3, 6 or 12 months.', 'BAD_TERM');
  if (!isOid(id)) return fail(404, 'Sponsorship not found');
  await connectDB();
  const sponsorship = await ClinicSponsorship.findOne({ _id: oid(id), repUserId: oid(repUserId) }).lean<Lean>();
  if (!sponsorship) return fail(404, 'Sponsorship not found');
  if (sponsorship.status !== 'accepted') {
    return fail(409, sponsorship.status === 'pending' ? 'The sponsorship hasn’t been accepted yet.' : 'This sponsorship is closed.', 'NOT_ACCEPTED');
  }
  if (!(await isPayMongoConfigured())) return fail(503, 'Online payment is not available right now.', 'PAYMENT_UNAVAILABLE');

  const [rep, tenant, pricing] = await Promise.all([
    MedicalRepresentative.findById(sponsorship.repId).select('firstName lastName email').lean<any>(),
    Tenant.findById(sponsorship.tenantId).select('name displayName').lean<any>(),
    getSponsorshipPricing(),
  ]);
  if (!rep || !tenant) return fail(404, 'Sponsorship not found');
  const clinicName: string = tenant.displayName || tenant.name || 'Clinic';
  const { amount, currency, percentOff } = sponsorshipPrice(months, pricing);
  const orderId = `pm_${randomBytes(12).toString('hex')}`;

  const checkout = await createCheckoutSession({
    name: `MyClinicSoft Professional for ${clinicName} (${termLabel(months)})`.slice(0, 255),
    amount,
    description: `Sponsored by ${rep.firstName} ${rep.lastName}: ${termLabel(months)} of Professional${percentOff ? `, ${percentOff}% off` : ''}`.slice(0, 255),
    referenceNumber: `MSP-${String(sponsorship._id).slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    successUrl: returnUrl('paid'),
    cancelUrl: returnUrl('cancelled'),
    email: rep.email,
    metadata: {
      purpose: 'clinic-sponsorship',
      orderId,
      tenantId: String(sponsorship.tenantId),
      sponsorshipId: String(sponsorship._id),
      repId: String(sponsorship.repId),
      months: String(months),
      amount: String(amount),
    },
  });
  await SubscriptionOrder.create({
    orderId,
    tenantId: sponsorship.tenantId,
    plan: SPONSORED_PLAN,
    billingCycle: months === 12 ? 'yearly' : 'monthly',
    months,
    sponsorshipId: sponsorship._id,
    amount,
    currency,
    provider: 'paymongo',
    gatewayId: checkout.id,
  });
  return { ok: true, data: { checkoutUrl: checkout.checkoutUrl, orderId, amount, months } };
}

export type SponsorshipPaymentResult = { ok: true; applied: boolean } | { ok: false; retry: boolean; error: string };

/**
 * Apply a paid sponsorship checkout once: the clinic's plan through the normal subscription path,
 * then the payment on the sponsorship. `meta` is the checkout metadata we set (trusted: it comes
 * from a signed webhook or a session fetched with our key).
 */
export async function applySponsorshipPayment(
  meta: Record<string, string>,
  paid: number,
  paymentId: string,
  gatewayId: string
): Promise<SponsorshipPaymentResult> {
  const months = Number(meta.months);
  if (!meta.orderId || !isOid(meta.tenantId) || !isOid(meta.sponsorshipId) || !isSponsorTerm(months)) {
    return { ok: false, retry: false, error: 'Sponsorship checkout without its order details' };
  }
  await connectDB();
  const orderId = meta.orderId;
  // The order record lapses after a while unpaid; the checkout's own details rebuild it.
  await SubscriptionOrder.updateOne(
    { orderId },
    {
      $setOnInsert: {
        orderId,
        tenantId: new Types.ObjectId(meta.tenantId),
        plan: SPONSORED_PLAN,
        billingCycle: months === 12 ? 'yearly' : 'monthly',
        months,
        sponsorshipId: new Types.ObjectId(meta.sponsorshipId),
        amount: Number(meta.amount) || paid,
        currency: 'PHP',
        provider: 'paymongo',
        gatewayId,
        status: 'pending',
      },
    },
    { upsert: true }
  );
  const r = await activateSubscriptionFromOrder(orderId, { transactionId: paymentId, amount: paid, currency: 'PHP' });
  if (!r.ok) return { ok: false, retry: r.status === 409, error: r.error };

  const paidThrough: Date | undefined = r.subscription?.expiresAt ? new Date(r.subscription.expiresAt) : undefined;
  const res = await ClinicSponsorship.updateOne(
    { _id: new Types.ObjectId(meta.sponsorshipId), 'payments.orderId': { $ne: orderId } },
    {
      $push: { payments: { orderId, paymentId, months, amount: paid, paidAt: new Date() } },
      ...(paidThrough ? { $set: { paidThrough } } : {}),
    }
  );
  if (res.modifiedCount > 0) {
    const row = await ClinicSponsorship.findById(meta.sponsorshipId).lean<Lean>();
    if (row) {
      const [view] = await toViews([row], 'rep');
      await notifyOther(view, 'rep', 'paid', undefined, months);
      await notifyRep(view, 'paid', months);
    }
  }
  return { ok: true, applied: !r.alreadyApplied };
}

// ── Notifications ────────────────────────────────────────────────────────────

type Event = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'ended' | 'paid' | 'renewal-due';

/** Tell the side that didn't act. */
async function notifyOther(view: SponsorshipView, actingSide: Side, event: Event, message?: string, months?: number) {
  if (actingSide === 'rep') await notifyClinic(view, event, message, months);
  else await notifyRep(view, event, months, message);
}

async function notifyClinic(view: SponsorshipView, event: Event, message?: string, months?: number) {
  const who = view.rep.company ? `${view.rep.name} (${view.rep.company})` : view.rep.name;
  const copy: Partial<Record<Event, { title: string; message: string }>> = {
    requested: { title: 'Sponsorship offer', message: `${who} offers to pay for your MyClinicSoft subscription.${message ? ` “${message}”` : ''}` },
    accepted: { title: 'Sponsorship accepted', message: `${who} agreed to sponsor your subscription. Your plan starts once they pay.` },
    declined: { title: 'Sponsorship declined', message: `${who} declined to sponsor your subscription.` },
    cancelled: { title: 'Sponsorship withdrawn', message: `${who} withdrew their sponsorship offer.` },
    ended: { title: 'Sponsorship ended', message: `${who} ended their sponsorship. Time already paid for stays on your plan.` },
    paid: { title: 'Subscription sponsored', message: `${who} paid for ${termLabel(months ?? 1)} of Professional for your clinic.` },
  };
  const c = copy[event];
  if (!c) return;
  try {
    await notifyStaff({
      tenantId: view.clinic.id,
      audience: { roles: ['admin', 'owner'] },
      type: 'system',
      priority: event === 'requested' || event === 'paid' ? 'high' : 'normal',
      ...c,
      actionUrl: '/admin/subscription#sponsorship',
      sender: { kind: 'system', name: who },
      metadata: { sponsorshipId: view.id, event },
    });
  } catch (error) {
    console.error('[sponsorship] clinic notification failed:', error);
  }
}

async function notifyRep(view: SponsorshipView, event: Event, months?: number, message?: string) {
  const clinic = view.clinic.name;
  const copy: Partial<Record<Event, { title: string; body: string }>> = {
    requested: { title: 'Sponsorship request', body: `${clinic} asks you to sponsor their MyClinicSoft subscription.${message ? ` “${message}”` : ''}` },
    accepted: { title: 'Sponsorship accepted', body: `${clinic} accepted your sponsorship. Pay to start their plan.` },
    declined: { title: 'Sponsorship declined', body: `${clinic} declined your sponsorship offer.` },
    cancelled: { title: 'Sponsorship request withdrawn', body: `${clinic} withdrew their sponsorship request.` },
    ended: { title: 'Sponsorship ended', body: `${clinic} ended your sponsorship.` },
    paid: { title: 'Sponsorship paid', body: `Thank you. ${clinic} is on Professional for ${termLabel(months ?? 1)} more.` },
    'renewal-due': {
      title: 'Sponsorship ends soon',
      body: `${clinic}'s sponsored plan ends ${view.paidThrough ? new Date(view.paidThrough).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'soon'}. Renew to keep it going.`,
    },
  };
  const c = copy[event];
  if (!c) return;
  try {
    const rep = await MedicalRepresentative.findById(view.rep.id).select('userId notificationsEnabled').lean<any>();
    if (!rep?.userId || rep.notificationsEnabled === false) return;
    await sendPushToUserDevices(String(rep.userId), {
      title: c.title,
      body: c.body.slice(0, 240),
      tag: `sponsorship-${view.id}`,
      data: { screen: 'sponsorships', id: view.id },
    });
  } catch (error) {
    console.error('[sponsorship] rep push failed:', error);
  }
}

/**
 * Remind reps whose sponsored period ends within RENEWAL_REMINDER_DAYS, once per period.
 * Run from the daily med-rep reminders cron.
 */
export async function sendSponsorshipRenewalReminders(now = new Date()): Promise<number> {
  await connectDB();
  const due = await ClinicSponsorship.find({
    status: 'accepted',
    paidThrough: { $gt: now, $lte: addDays(now, RENEWAL_REMINDER_DAYS) },
    $expr: { $ne: ['$reminderSentFor', '$paidThrough'] },
  })
    .limit(500)
    .lean<Lean[]>();
  let sent = 0;
  for (const row of due) {
    const claimed = await ClinicSponsorship.updateOne(
      { _id: row._id, paidThrough: row.paidThrough, reminderSentFor: { $ne: row.paidThrough } },
      { $set: { reminderSentFor: row.paidThrough } }
    );
    if (!claimed.modifiedCount) continue;
    const [view] = await toViews([row], 'rep', now);
    await notifyRep(view, 'renewal-due');
    sent++;
  }
  return sent;
}
