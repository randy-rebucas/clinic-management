import 'server-only';
import { Types } from 'mongoose';
import { addMonths, addYears } from 'date-fns';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepTeam from '@/models/RepTeam';
import { getPlatformFees, getPlanPricing } from '@/lib/platform-config';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import type { BillingCycle } from '@/lib/subscription-period';

/**
 * What medical reps pay to book visits with clinics. Clinics never pay for it.
 *
 *  - Individual: `medrepMonthlyFee` a month (yearly = that × the plan list's months per year).
 *  - Team: `medrepSeatMonthlyFee` per seat a month, bought by the team's manager; it covers up
 *    to that many team members.
 *
 * A fee of 0 means free: with `medrepMonthlyFee` 0 every activated rep can book. Logging their
 * own visits and products never needs a subscription.
 */

export interface RepPrices {
  monthly: number;
  yearly: number;
  seatMonthly: number;
  seatYearly: number;
  yearlyMonths: number;
  /** Booking is free for everyone (no individual fee set). */
  free: boolean;
  /** Payments can be taken online right now. */
  payable: boolean;
}

export async function getRepPrices(): Promise<RepPrices> {
  const [fees, pricing, payable] = await Promise.all([getPlatformFees(), getPlanPricing(), isPayMongoConfigured()]);
  return {
    monthly: fees.medrepMonthlyFee,
    yearly: fees.medrepMonthlyFee * pricing.yearlyMonths,
    seatMonthly: fees.medrepSeatMonthlyFee,
    seatYearly: fees.medrepSeatMonthlyFee * pricing.yearlyMonths,
    yearlyMonths: pricing.yearlyMonths,
    free: fees.medrepMonthlyFee === 0,
    payable,
  };
}

/** Where a period bought now ends: one cycle after the later of now and the current end. */
export function repPeriodEnd(currentEnd: Date | null | undefined, cycle: BillingCycle, now = new Date()): Date {
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  return cycle === 'yearly' ? addYears(base, 1) : addMonths(base, 1);
}

export interface TeamCoverage {
  active: boolean;
  seats: number;
  members: number;
  expiresAt: Date | null;
}

export async function teamCoverage(teamId: unknown, now = new Date()): Promise<TeamCoverage> {
  await connectDB();
  const [team, members] = await Promise.all([
    RepTeam.findById(teamId).select('subscription.seats subscription.expiresAt').lean<any>(),
    MedicalRepresentative.countDocuments({ teamId }),
  ]);
  const expiresAt: Date | null = team?.subscription?.expiresAt ?? null;
  const seats = team?.subscription?.seats ?? 0;
  return { active: !!expiresAt && expiresAt > now && seats > 0, seats, members, expiresAt };
}

export type BookingAccess = { ok: true; via: 'free' | 'individual' | 'team' } | { ok: false };

/** Whether a rep may book visits with clinics now. */
export async function repBookingAccess(
  profile: { subscription?: { expiresAt?: Date }; teamId?: unknown },
  now = new Date()
): Promise<BookingAccess> {
  const fees = await getPlatformFees();
  if (fees.medrepMonthlyFee === 0) return { ok: true, via: 'free' };
  const ends = profile.subscription?.expiresAt;
  if (ends && new Date(ends) > now) return { ok: true, via: 'individual' };
  if (profile.teamId) {
    const team = await teamCoverage(profile.teamId, now);
    // Over-full teams (members added before seats shrank) are not covered until seats catch up.
    if (team.active && team.members <= team.seats) return { ok: true, via: 'team' };
  }
  return { ok: false };
}

function returnUrl(status: 'paid' | 'cancelled') {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return `${base}/medical-representatives/paid?status=${status}`;
}

export class RepCheckoutError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

/** A PayMongo checkout for a rep's own subscription. */
export async function createRepSubscriptionCheckout(rep: { _id: unknown; firstName: string; lastName: string; email: string }, cycle: BillingCycle) {
  const prices = await getRepPrices();
  if (prices.free) throw new RepCheckoutError('Booking with clinics is free right now; there is nothing to pay.', 409, 'SUBSCRIPTION_FREE');
  if (!prices.payable) throw new RepCheckoutError('Online payment is not available right now.', 503, 'PAYMENT_UNAVAILABLE');
  const amount = cycle === 'yearly' ? prices.yearly : prices.monthly;
  return createCheckoutSession({
    name: `MyClinicSoft rep subscription (${cycle})`,
    amount,
    description: `${cycle === 'yearly' ? 'One year' : 'One month'} of clinic visit booking for ${rep.firstName} ${rep.lastName}`,
    referenceNumber: `MRS-${String(rep._id).slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    successUrl: returnUrl('paid'),
    cancelUrl: returnUrl('cancelled'),
    email: rep.email,
    metadata: { purpose: 'medrep-subscription', repId: String(rep._id), billingCycle: cycle, amount: String(amount) },
  });
}

/** A PayMongo checkout for a team's seats, bought by its manager. */
export async function createTeamCheckout(team: { _id: unknown; name: string }, seats: number, cycle: BillingCycle, email: string) {
  const prices = await getRepPrices();
  if (prices.seatMonthly === 0) throw new RepCheckoutError('Team plans are not sold online. Contact us for a quote.', 409, 'TEAM_PLAN_UNAVAILABLE');
  if (!prices.payable) throw new RepCheckoutError('Online payment is not available right now.', 503, 'PAYMENT_UNAVAILABLE');
  const amount = seats * (cycle === 'yearly' ? prices.seatYearly : prices.seatMonthly);
  return createCheckoutSession({
    name: `MyClinicSoft rep team plan: ${seats} seat${seats === 1 ? '' : 's'} (${cycle})`,
    amount,
    description: `${cycle === 'yearly' ? 'One year' : 'One month'} for ${team.name}`.slice(0, 255),
    referenceNumber: `MRT-${String(team._id).slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    successUrl: returnUrl('paid'),
    cancelUrl: returnUrl('cancelled'),
    email,
    metadata: { purpose: 'medrep-team', teamId: String(team._id), seats: String(seats), billingCycle: cycle, amount: String(amount) },
  });
}

const isOid = (v: unknown): v is string => typeof v === 'string' && Types.ObjectId.isValid(v);
const cycleOf = (v: unknown): BillingCycle => (v === 'yearly' ? 'yearly' : 'monthly');

export type RepPaymentResult = { ok: true; applied: boolean } | { ok: false; error: string };

/** Apply a paid rep subscription checkout once (repeat calls for the same payment do nothing). */
export async function applyRepSubscriptionPayment(meta: Record<string, string>, paid: number, paymentId: string, now = new Date()): Promise<RepPaymentResult> {
  if (!isOid(meta.repId)) return { ok: false, error: 'Rep subscription checkout without its rep' };
  const fee = Number(meta.amount) || 0;
  if (paid + 0.005 < fee) return { ok: false, error: `Rep subscription paid ${paid}, price is ${fee}` };
  const cycle = cycleOf(meta.billingCycle);
  const rep = await MedicalRepresentative.findById(meta.repId).select('subscription').lean<any>();
  if (!rep) return { ok: false, error: 'Rep not found' };
  if ((rep.subscription?.paymentHistory ?? []).some((p: any) => p.paymentId === paymentId)) return { ok: true, applied: false };
  const res = await MedicalRepresentative.updateOne(
    { _id: rep._id, 'subscription.paymentHistory.paymentId': { $ne: paymentId } },
    {
      $set: {
        'subscription.billingCycle': cycle,
        'subscription.expiresAt': repPeriodEnd(rep.subscription?.expiresAt, cycle, now),
        'subscription.lastPaymentId': paymentId,
      },
      $push: { 'subscription.paymentHistory': { paymentId, amount: paid, billingCycle: cycle, paidAt: now } },
    }
  );
  return { ok: true, applied: res.modifiedCount > 0 };
}

/**
 * Apply a paid team checkout once. The team gets the seats bought, for one cycle from the end of
 * what it has already paid for.
 */
export async function applyTeamPayment(meta: Record<string, string>, paid: number, paymentId: string, now = new Date()): Promise<RepPaymentResult> {
  if (!isOid(meta.teamId)) return { ok: false, error: 'Team checkout without its team' };
  const seats = Math.floor(Number(meta.seats));
  if (!Number.isFinite(seats) || seats < 1) return { ok: false, error: 'Team checkout without seats' };
  const fee = Number(meta.amount) || 0;
  if (paid + 0.005 < fee) return { ok: false, error: `Team plan paid ${paid}, price is ${fee}` };
  const cycle = cycleOf(meta.billingCycle);
  const team = await RepTeam.findById(meta.teamId).select('subscription').lean<any>();
  if (!team) return { ok: false, error: 'Team not found' };
  if ((team.subscription?.paymentHistory ?? []).some((p: any) => p.paymentId === paymentId)) return { ok: true, applied: false };
  const res = await RepTeam.updateOne(
    { _id: team._id, 'subscription.paymentHistory.paymentId': { $ne: paymentId } },
    {
      $set: {
        'subscription.seats': seats,
        'subscription.billingCycle': cycle,
        'subscription.expiresAt': repPeriodEnd(team.subscription?.expiresAt, cycle, now),
        'subscription.lastPaymentId': paymentId,
      },
      $push: { 'subscription.paymentHistory': { paymentId, amount: paid, seats, billingCycle: cycle, paidAt: now } },
    }
  );
  return { ok: true, applied: res.modifiedCount > 0 };
}
