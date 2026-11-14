import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepTeam from '@/models/RepTeam';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import ClinicSponsorship from '@/models/ClinicSponsorship';
import RepReferralCode from '@/models/RepReferralCode';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { escapeRegex } from '@/lib/api/validate';
import { getPlatformFees } from '@/lib/platform-config';

/** Loaders for the platform console's Medical reps pages. Every value returned is plain JSON. */

export type RepState = 'active' | 'awaiting' | 'inactive' | 'on-leave';
export const REP_STATES: RepState[] = ['active', 'awaiting', 'inactive', 'on-leave'];
export const REP_STATE_LABEL: Record<RepState, string> = {
  active: 'Active',
  awaiting: 'Awaiting activation',
  inactive: 'Inactive',
  'on-leave': 'On leave',
};

/** Mongo filter for each state. "Awaiting" = registered but the activation fee isn't paid yet. */
const STATE_FILTER: Record<RepState, Record<string, unknown>> = {
  active: { isActivated: true, status: 'active' },
  awaiting: { isActivated: { $ne: true } },
  inactive: { isActivated: true, status: 'inactive' },
  'on-leave': { isActivated: true, status: 'on-leave' },
};

function stateOf(r: { isActivated?: boolean; status?: string }): RepState {
  if (!r.isActivated) return 'awaiting';
  return r.status === 'inactive' ? 'inactive' : r.status === 'on-leave' ? 'on-leave' : 'active';
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export const REP_MONTHS = 6;

/** YYYY-MM keys for the last `n` months, oldest first, and the UTC start of the first. */
function lastMonths(now: Date, n: number): { keys: string[]; from: Date } {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return { keys, from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1)) };
}
const nameOf = (r: { firstName?: string; lastName?: string; title?: string }) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '—';

/** How the rep may book clinic visits: free for everyone, their own plan, their team's, or none. */
export type BookingPlan =
  | { kind: 'free' }
  | { kind: 'own'; until: string }
  | { kind: 'team'; team: string; until: string }
  | { kind: 'none'; endedOn: string | null };

function bookingPlan(
  r: { subscription?: { expiresAt?: Date }; teamId?: Types.ObjectId },
  team: { name: string; subscription?: { expiresAt?: Date; seats?: number } } | undefined,
  free: boolean,
  now: Date
): BookingPlan {
  if (free) return { kind: 'free' };
  const own = r.subscription?.expiresAt;
  if (own && new Date(own) > now) return { kind: 'own', until: iso(own)! };
  const teamEnds = team?.subscription?.expiresAt;
  if (team && teamEnds && new Date(teamEnds) > now && (team.subscription?.seats ?? 0) > 0) {
    return { kind: 'team', team: team.name, until: iso(teamEnds)! };
  }
  return { kind: 'none', endedOn: iso(own) };
}

export interface PlatformRepRow {
  id: string;
  name: string;
  email: string;
  company: string;
  territory: string | null;
  state: RepState;
  plan: BookingPlan;
  clinics: number;
  referred: number;
  sponsoring: number;
  visits: { total: number; completed: number };
  lastLogin: string | null;
  createdAt: string;
}

export interface PlatformRepList {
  rows: PlatformRepRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<RepState | 'all', number>;
  /** Reps registered per month, last REP_MONTHS months, oldest first (ignores search and state). */
  signupsByMonth: Array<{ month: string; count: number }>;
}

export type RepSort = 'newest' | 'oldest' | 'name';
export const REP_SORTS: RepSort[] = ['newest', 'oldest', 'name'];
const REP_SORT_SPEC: Record<RepSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { firstName: 1, lastName: 1, _id: 1 },
};

export async function loadPlatformReps(opts: { q?: string; state?: RepState | ''; page?: number; sort?: RepSort }): Promise<PlatformRepList> {
  await connectDB();
  const now = new Date();
  const pageSize = 25;
  const page = Math.max(1, opts.page ?? 1);

  const search: Record<string, unknown> = {};
  const q = opts.q?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    search.$or = [{ firstName: re }, { lastName: re }, { email: re }, { company: re }, { territory: re }, { phone: re }];
  }
  const filter = opts.state ? { ...search, ...STATE_FILTER[opts.state] } : search;

  const months = lastMonths(now, REP_MONTHS);
  const [total, countsArr, reps, fees, signups] = await Promise.all([
    MedicalRepresentative.countDocuments(filter),
    Promise.all(REP_STATES.map((s) => MedicalRepresentative.countDocuments({ ...search, ...STATE_FILTER[s] }))),
    MedicalRepresentative.find(filter)
      .sort(REP_SORT_SPEC[opts.sort ?? 'newest'])
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('firstName lastName email company territory status isActivated tenantIds teamId subscription.expiresAt userId lastLogin createdAt')
      .lean<any[]>(),
    getPlatformFees(),
    // Small collection; no createdAt-only index, so this scans it.
    MedicalRepresentative.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: months.from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
  ]);
  const signupBy = new Map(signups.map((x) => [x._id, x.count]));

  const ids = reps.map((r) => r._id as Types.ObjectId);
  const teamIds = reps.map((r) => r.teamId).filter(Boolean);
  const userIds = reps.map((r) => r.userId).filter(Boolean);
  // Visits counted from the records: the stored performanceMetrics counters only move when a
  // clinic closes a visit, so they miss older and imported ones. Older visits carry only userId.
  const repByUser = new Map(reps.filter((r) => r.userId).map((r) => [String(r.userId), String(r._id)]));
  const [teams, users, referred, sponsoring, visitAgg] = await Promise.all([
    teamIds.length ? RepTeam.find({ _id: { $in: teamIds } }).select('name subscription.expiresAt subscription.seats').lean<any[]>() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('lastLogin').lean<any[]>() : [],
    ids.length
      ? Tenant.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { 'referral.repId': { $in: ids } } }, { $group: { _id: '$referral.repId', n: { $sum: 1 } } }])
      : [],
    ids.length
      ? ClinicSponsorship.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { repId: { $in: ids }, status: 'accepted' } }, { $group: { _id: '$repId', n: { $sum: 1 } } }])
      : [],
    ids.length
      ? MedicalRepresentativeVisit.aggregate<{ _id: { rep: Types.ObjectId | null; user: Types.ObjectId }; total: number; completed: number }>([
          { $match: { $or: [{ medicalRepresentativeId: { $in: ids } }, ...(userIds.length ? [{ userId: { $in: userIds } }] : [])] } },
          {
            $group: {
              _id: { rep: '$medicalRepresentativeId', user: '$userId' },
              total: { $sum: 1 },
              completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            },
          },
        ])
      : [],
  ]);
  const visitsBy = new Map<string, { total: number; completed: number }>();
  for (const v of visitAgg) {
    const rep = v._id.rep ? String(v._id.rep) : repByUser.get(String(v._id.user));
    if (!rep) continue;
    const cur = visitsBy.get(rep) ?? { total: 0, completed: 0 };
    visitsBy.set(rep, { total: cur.total + v.total, completed: cur.completed + v.completed });
  }
  const teamBy = new Map(teams.map((t) => [String(t._id), t]));
  const loginBy = new Map(users.map((u) => [String(u._id), u.lastLogin]));
  const referredBy = new Map(referred.map((x) => [String(x._id), x.n]));
  const sponsoringBy = new Map(sponsoring.map((x) => [String(x._id), x.n]));
  const free = fees.medrepMonthlyFee === 0;

  const counts = { all: countsArr.reduce((a, b) => a + b, 0) } as PlatformRepList['counts'];
  REP_STATES.forEach((s, i) => (counts[s] = countsArr[i]));

  return {
    total,
    page,
    pageSize,
    counts,
    signupsByMonth: months.keys.map((month) => ({ month, count: signupBy.get(month) ?? 0 })),
    rows: reps.map((r) => ({
      id: String(r._id),
      name: nameOf(r),
      email: r.email,
      company: r.company || '—',
      territory: r.territory || null,
      state: stateOf(r),
      plan: bookingPlan(r, r.teamId ? teamBy.get(String(r.teamId)) : undefined, free, now),
      clinics: (r.tenantIds ?? []).length,
      referred: referredBy.get(String(r._id)) ?? 0,
      sponsoring: sponsoringBy.get(String(r._id)) ?? 0,
      visits: visitsBy.get(String(r._id)) ?? { total: 0, completed: 0 },
      lastLogin: iso(loginBy.get(String(r.userId)) ?? r.lastLogin),
      createdAt: iso(r.createdAt)!,
    })),
  };
}

export interface PlatformRepDetail {
  id: string;
  name: string;
  title: string | null;
  email: string;
  phone: string | null;
  company: string;
  territory: string | null;
  products: string[];
  bio: string | null;
  state: RepState;
  createdAt: string;
  lastLogin: string | null;
  hasLogin: boolean;
  activation: { paid: boolean; date: string | null; amount: number | null; method: string | null; reference: string | null; status: string };
  plan: BookingPlan;
  payments: { amount: number; cycle: string; paidAt: string }[];
  team: { name: string; seats: number; until: string | null } | null;
  visits: { total: number; completed: number; cancelled: number };
  /** From the visit records themselves: every visit by status, and visits per month by the date they're for. */
  visitLog: {
    byStatus: Partial<Record<VisitStatus, number>>;
    byMonth: Array<{ month: string; completed: number; other: number }>;
  };
  clinics: { id: string; name: string; subdomain: string; referredByThisRep: boolean }[];
  sponsorships: { id: string; clinicId: string; clinic: string; status: string; paidThrough: string | null; payments: number; createdAt: string }[];
  codes: { code: string; source: 'rep' | 'platform'; status: string; uses: number; maxUses: number | null }[];
}

export type VisitStatus = 'requested' | 'scheduled' | 'declined' | 'completed' | 'cancelled' | 'no-show';

export async function loadPlatformRep(id: string): Promise<PlatformRepDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const r = await MedicalRepresentative.findById(id)
    .select('-password -profileImage -internalNotes -availability -availabilityOverrides')
    .lean<any>();
  if (!r) return null;
  const now = new Date();
  const repId = r._id as Types.ObjectId;

  const months = lastMonths(now, REP_MONTHS);
  // Visits carry medicalRepresentativeId, or only the rep's userId on older records; both are indexed.
  const visitMatch = { $or: [{ medicalRepresentativeId: repId }, ...(r.userId ? [{ userId: r.userId }] : [])] };
  const [team, user, clinics, sponsorships, codes, fees, visitStatus, visitMonths] = await Promise.all([
    r.teamId ? RepTeam.findById(r.teamId).select('name subscription.expiresAt subscription.seats').lean<any>() : null,
    r.userId ? User.findById(r.userId).select('lastLogin').lean<any>() : null,
    (r.tenantIds ?? []).length
      ? Tenant.find({ _id: { $in: r.tenantIds } }).sort({ name: 1 }).select('name displayName subdomain referral.repId').lean<any[]>()
      : [],
    ClinicSponsorship.find({ repId }).sort({ createdAt: -1 }).limit(50).select('tenantId status paidThrough payments createdAt').lean<any[]>(),
    RepReferralCode.find({ repId }).sort({ createdAt: -1 }).select('code source status uses maxUses').lean<any[]>(),
    getPlatformFees(),
    MedicalRepresentativeVisit.aggregate<{ _id: VisitStatus; n: number }>([
      { $match: visitMatch },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    MedicalRepresentativeVisit.aggregate<{ _id: { m: string; done: boolean }; n: number }>([
      { $match: { ...visitMatch, date: { $gte: months.from } } },
      {
        $group: {
          _id: { m: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'UTC' } }, done: { $eq: ['$status', 'completed'] } },
          n: { $sum: 1 },
        },
      },
    ]),
  ]);
  const monthAgg = new Map<string, { completed: number; other: number }>(months.keys.map((k) => [k, { completed: 0, other: 0 }]));
  for (const x of visitMonths) {
    const m = monthAgg.get(x._id.m);
    if (m) m[x._id.done ? 'completed' : 'other'] += x.n;
  }
  const sponsoredIds = [...new Set(sponsorships.map((s) => String(s.tenantId)))];
  const sponsoredTenants = sponsoredIds.length
    ? await Tenant.find({ _id: { $in: sponsoredIds } }).select('name displayName').lean<any[]>()
    : [];
  const tenantName = new Map(sponsoredTenants.map((t) => [String(t._id), t.displayName || t.name]));

  return {
    id: String(repId),
    name: nameOf(r),
    title: r.title || null,
    email: r.email,
    phone: r.phone || null,
    company: r.company || '—',
    territory: r.territory || null,
    products: r.products ?? [],
    bio: r.bio || null,
    state: stateOf(r),
    createdAt: iso(r.createdAt)!,
    lastLogin: iso(user?.lastLogin ?? r.lastLogin),
    hasLogin: !!r.userId,
    activation: {
      paid: r.paymentStatus === 'completed',
      date: iso(r.activationDate ?? r.paymentDate),
      amount: r.paymentAmount ?? null,
      method: r.paymentMethod || null,
      reference: r.paymentReference || null,
      status: r.paymentStatus || 'pending',
    },
    plan: bookingPlan(r, team ?? undefined, fees.medrepMonthlyFee === 0, now),
    payments: (r.subscription?.paymentHistory ?? [])
      .slice()
      .sort((a: any, b: any) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      .map((p: any) => ({ amount: p.amount, cycle: p.billingCycle, paidAt: iso(p.paidAt)! })),
    team: team ? { name: team.name, seats: team.subscription?.seats ?? 0, until: iso(team.subscription?.expiresAt) } : null,
    visits: {
      total: r.performanceMetrics?.totalVisits ?? 0,
      completed: r.performanceMetrics?.completedVisits ?? 0,
      cancelled: r.performanceMetrics?.cancelledVisits ?? 0,
    },
    visitLog: {
      byStatus: Object.fromEntries(visitStatus.map((x) => [x._id, x.n])),
      byMonth: months.keys.map((month) => ({ month, ...monthAgg.get(month)! })),
    },
    clinics: clinics.map((t) => ({
      id: String(t._id),
      name: t.displayName || t.name,
      subdomain: t.subdomain,
      referredByThisRep: String(t.referral?.repId ?? '') === String(repId),
    })),
    sponsorships: sponsorships.map((s) => ({
      id: String(s._id),
      clinicId: String(s.tenantId),
      clinic: tenantName.get(String(s.tenantId)) ?? 'Removed clinic',
      status: s.status,
      paidThrough: iso(s.paidThrough),
      payments: (s.payments ?? []).length,
      createdAt: iso(s.createdAt)!,
    })),
    codes: codes.map((c) => ({ code: c.code, source: c.source, status: c.status, uses: c.uses, maxUses: c.maxUses ?? null })),
  };
}
