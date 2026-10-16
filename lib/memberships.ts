// Membership (loyalty programme) rules shared by the model, the API and the pages.
// Client-safe: no database imports.

export const MEMBERSHIP_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type MembershipTier = (typeof MEMBERSHIP_TIERS)[number];

export const MEMBERSHIP_STATUSES = ['active', 'inactive', 'expired', 'suspended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** What each tier gives. The model's save hook derives discount and benefits from this. */
export const TIER: Record<MembershipTier, { label: string; rank: number; discount: number; benefits: string[] }> = {
  bronze: { label: 'Bronze', rank: 1, discount: 5, benefits: ['points_earn'] },
  silver: { label: 'Silver', rank: 2, discount: 10, benefits: ['points_earn', 'priority_booking'] },
  gold: { label: 'Gold', rank: 3, discount: 15, benefits: ['points_earn', 'priority_booking', 'free_consultation_monthly'] },
  platinum: { label: 'Platinum', rank: 4, discount: 20, benefits: ['points_earn', 'priority_booking', 'free_consultation_monthly', 'discount_on_procedures'] },
};

export const BENEFIT_LABEL: Record<string, string> = {
  points_earn: 'Earns points',
  priority_booking: 'Priority booking',
  free_consultation_monthly: 'One free consultation a month',
  discount_on_procedures: 'Discount on procedures',
};

export const benefitLabel = (b: string) => BENEFIT_LABEL[b] ?? b.replace(/_/g, ' ');

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  expired: 'Expired',
  suspended: 'Suspended',
};

/** Points both the new member and whoever referred them get. */
export const REFERRAL_BONUS = 100;

/** A renewal is "due" from this many days before the expiry date. */
export const RENEWAL_DAYS = 30;

const DAY = 86_400_000;

/** True once the moment has passed. */
export function isPast(iso: string | Date | null | undefined, now = Date.now()): boolean {
  return Boolean(iso) && new Date(iso!).getTime() < now;
}

export function daysUntil(iso: string | Date | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / DAY);
}

/**
 * The state the desk acts on. "Renewal due" is an active membership inside the renewal window;
 * an active one past its date reads as expired even before the nightly job marks it.
 */
export type MembershipState = 'active' | 'due' | 'expired' | 'suspended' | 'inactive';

export function membershipState(m: { status: string; expiryDate?: string | Date | null }, now = Date.now()): MembershipState {
  if (m.status === 'suspended' || m.status === 'inactive' || m.status === 'expired') return m.status;
  if (m.expiryDate && new Date(m.expiryDate).getTime() < now) return 'expired';
  const d = daysUntil(m.expiryDate, now);
  if (d !== null && d <= RENEWAL_DAYS) return 'due';
  return 'active';
}

/** The discount a membership gives on a bill today, or null when it gives none. */
export function billingDiscount(m: { status: string; tier: string; expiryDate?: string | Date | null; discountPercentage?: number }, now = Date.now()) {
  const state = membershipState(m, now);
  if (state !== 'active' && state !== 'due') return null;
  const pct = m.discountPercentage ?? TIER[m.tier as MembershipTier]?.discount ?? 0;
  return pct > 0 ? pct : null;
}

/** The status filter on the list: the stored statuses plus "due" (active, renewal window). */
export const STATUS_FILTERS = ['active', 'due', 'expired', 'suspended', 'inactive'] as const;
export type MembershipStatusFilter = (typeof STATUS_FILTERS)[number];

export const STATUS_FILTER_LABEL: Record<MembershipStatusFilter, string> = {
  active: 'Active',
  due: `Renewal due (${RENEWAL_DAYS} days)`,
  expired: 'Expired',
  suspended: 'Suspended',
  inactive: 'Inactive',
};

export const SORTS = ['newest', 'points', 'expiry', 'name'] as const;
export type MembershipSort = (typeof SORTS)[number];
export const SORT_LABEL: Record<MembershipSort, string> = {
  newest: 'Newest members',
  points: 'Most points',
  expiry: 'Expiring first',
  name: 'Name',
};

/** One year on from a date (or from today when that date has passed). */
export function renewedUntil(expiry: string | Date | null | undefined, now = new Date()): Date {
  const base = expiry && new Date(expiry).getTime() > now.getTime() ? new Date(expiry) : now;
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}
