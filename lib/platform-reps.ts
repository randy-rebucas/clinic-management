import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepTeam from '@/models/RepTeam';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import ClinicSponsorship from '@/models/ClinicSponsorship';
import RepReferralCode from '@/models/RepReferralCode';
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
}

export async function loadPlatformReps(opts: { q?: string; state?: RepState | ''; page?: number }): Promise<PlatformRepList> {
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

  const [total, countsArr, reps, fees] = await Promise.all([
    MedicalRepresentative.countDocuments(filter),
    Promise.all(REP_STATES.map((s) => MedicalRepresentative.countDocuments({ ...search, ...STATE_FILTER[s] }))),
    MedicalRepresentative.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select('firstName lastName email company territory status isActivated tenantIds teamId subscription.expiresAt performanceMetrics userId lastLogin createdAt')
      .lean<any[]>(),
    getPlatformFees(),
  ]);

  const ids = reps.map((r) => r._id as Types.ObjectId);
  const teamIds = reps.map((r) => r.teamId).filter(Boolean);
  const userIds = reps.map((r) => r.userId).filter(Boolean);
  const [teams, users, referred, sponsoring] = await Promise.all([
    teamIds.length ? RepTeam.find({ _id: { $in: teamIds } }).select('name subscription.expiresAt subscription.seats').lean<any[]>() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('lastLogin').lean<any[]>() : [],
    ids.length
      ? Tenant.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { 'referral.repId': { $in: ids } } }, { $group: { _id: '$referral.repId', n: { $sum: 1 } } }])
      : [],
    ids.length
      ? ClinicSponsorship.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { repId: { $in: ids }, status: 'accepted' } }, { $group: { _id: '$repId', n: { $sum: 1 } } }])
      : [],
  ]);
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
      visits: { total: r.performanceMetrics?.totalVisits ?? 0, completed: r.performanceMetrics?.completedVisits ?? 0 },
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
  clinics: { id: string; name: string; subdomain: string; referredByThisRep: boolean }[];
  sponsorships: { id: string; clinicId: string; clinic: string; status: string; paidThrough: string | null; payments: number; createdAt: string }[];
  codes: { code: string; source: 'rep' | 'platform'; status: string; uses: number; maxUses: number | null }[];
}

export async function loadPlatformRep(id: string): Promise<PlatformRepDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const r = await MedicalRepresentative.findById(id)
    .select('-password -profileImage -internalNotes -availability -availabilityOverrides')
    .lean<any>();
  if (!r) return null;
  const now = new Date();
  const repId = r._id as Types.ObjectId;

  const [team, user, clinics, sponsorships, codes, fees] = await Promise.all([
    r.teamId ? RepTeam.findById(r.teamId).select('name subscription.expiresAt subscription.seats').lean<any>() : null,
    r.userId ? User.findById(r.userId).select('lastLogin').lean<any>() : null,
    (r.tenantIds ?? []).length
      ? Tenant.find({ _id: { $in: r.tenantIds } }).sort({ name: 1 }).select('name displayName subdomain referral.repId').lean<any[]>()
      : [],
    ClinicSponsorship.find({ repId }).sort({ createdAt: -1 }).limit(50).select('tenantId status paidThrough payments createdAt').lean<any[]>(),
    RepReferralCode.find({ repId }).sort({ createdAt: -1 }).select('code source status uses maxUses').lean<any[]>(),
    getPlatformFees(),
  ]);
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
