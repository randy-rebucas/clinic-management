'use client';

import { TIER, daysUntil, isPast, type MembershipState, type MembershipTier } from '@/lib/memberships';

export interface MembershipRow {
  _id: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string; phone?: string } | null;
  membershipNumber: string;
  tier: MembershipTier;
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  points: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  discountPercentage: number;
  joinDate: string;
  expiryDate?: string | null;
  renewalDate?: string | null;
  referralCount?: number;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const pts = (n: number) => n.toLocaleString('en-US');
export const memberName = (m: { patient: MembershipRow['patient'] }) => (m.patient ? `${m.patient.firstName} ${m.patient.lastName}` : 'Patient record unavailable');

/**
 * The tier as four ascending steps filled up to its rank, beside its name. Tiers are an order,
 * not categories, so they get one hue and a length rather than a metal colour each.
 */
export function TierMark({ tier, showDiscount = false, className = '' }: { tier: MembershipTier; showDiscount?: boolean; className?: string }) {
  const t = TIER[tier];
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span aria-hidden="true" className="flex items-end gap-[2px]">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={`w-[3px] rounded-[1px] ${step <= t.rank ? 'bg-brand-teal-dark' : 'bg-gray-200'}`} style={{ height: 4 + step * 2.5 }} />
        ))}
      </span>
      <span className="font-medium text-gray-900">{t.label}</span>
      {showDiscount && <span className="font-mono text-xs text-gray-500">{t.discount}% off</span>}
    </span>
  );
}

/**
 * Active = emerald, renewal due = pending amber, expired = white with a red outline and word
 * (as expired stock), suspended = gray fill, inactive = white with a gray outline.
 */
export const MEMBERSHIP_STATE: Record<MembershipState, { label: string; badge: string }> = {
  active: { label: 'Active', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  due: { label: 'Renewal due', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  expired: { label: 'Expired', badge: 'bg-white text-red-700 ring-red-300' },
  suspended: { label: 'Suspended', badge: 'bg-gray-100 text-gray-700 ring-gray-300' },
  inactive: { label: 'Inactive', badge: 'bg-white text-gray-600 ring-gray-300' },
};

export function StateBadge({ state }: { state: MembershipState }) {
  const s = MEMBERSHIP_STATE[state];
  return <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.badge}`}>{s.label}</span>;
}

/** "No end date", "Valid until Mar 2, 2027", "Ends in 12 days" (amber within 30), "Ended Oct 2" (red). */
export function ValidUntil({ iso, className = '' }: { iso?: string | null; className?: string }) {
  if (!iso) return <span className={`text-gray-500 ${className}`}>No end date</span>;
  const d = daysUntil(iso) ?? 0;
  if (isPast(iso))
    return (
      <span className={`font-medium text-red-700 ${className}`}>
        Ended <span className="font-mono">{shortDate(iso)}</span>
      </span>
    );
  if (d <= 1) return <span className={`font-medium text-amber-800 ${className}`}>Ends {d <= 0 ? 'today' : 'tomorrow'}</span>;
  if (d <= 30)
    return (
      <span className={`font-medium text-amber-800 ${className}`}>
        Ends in <span className="font-mono">{d}</span> days
      </span>
    );
  return (
    <span className={`text-gray-600 ${className}`}>
      Valid until <span className="font-mono">{shortDate(iso)}</span>
    </span>
  );
}
