import Link from 'next/link';
import { LIFECYCLE_LABEL, type TenantLifecycle } from '@/lib/platform-metrics';
import type { SupportStatus } from '@/models/SupportRequest';
import type { VoucherBatchStatus } from '@/models/VoucherBatch';

/** Formatting and badges shared by the platform console's server and client components. */

export const money = (n: number, currency: string) =>
  n.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });

export const pct = (rate: number | null) => (rate === null ? '—' : `${(rate * 100).toFixed(rate < 0.1 && rate > 0 ? 1 : 0)}%`);

export const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export function ago(iso: string | null): string {
  if (!iso) return 'Never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 45 ? `${days} d ago` : day(iso);
}

export const planLabel = (plan: string) => plan.charAt(0).toUpperCase() + plan.slice(1);

const LIFECYCLE_TONE: Record<TenantLifecycle, string> = {
  paying: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cancelling: 'bg-amber-50 text-amber-800 ring-amber-200',
  trial: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30',
  'trial-ended': 'bg-white text-gray-600 ring-gray-300',
  lapsed: 'bg-rose-50 text-rose-800 ring-rose-200',
  suspended: 'bg-gray-100 text-gray-700 ring-gray-300',
};

export function LifecycleBadge({ lifecycle }: { lifecycle: TenantLifecycle }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${LIFECYCLE_TONE[lifecycle]}`}>
      {LIFECYCLE_LABEL[lifecycle]}
    </span>
  );
}

const STATUS_TONE: Record<SupportStatus, string> = {
  open: 'bg-amber-50 text-amber-800 ring-amber-200',
  'in-progress': 'bg-blue-50 text-blue-800 ring-blue-200',
  resolved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  closed: 'bg-gray-100 text-gray-600 ring-gray-200',
};

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_TONE[status]}`}>
      {SUPPORT_STATUS_LABEL[status]}
    </span>
  );
}

export const CARD = 'rounded-lg border border-gray-200 bg-white';
export const H2 = 'text-sm font-semibold text-gray-900';
export const LINK = 'font-medium text-brand-teal-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal rounded';

/** Pesos, whole (eMCR vouchers are priced in PHP). */
export const php = (n: number) => money(n, 'PHP');

const BATCH_TONE: Record<VoucherBatchStatus, string> = {
  unpaid: 'bg-amber-50 text-amber-800 ring-amber-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  void: 'bg-gray-100 text-gray-600 ring-gray-300',
};

export function BatchStatusBadge({ status }: { status: VoucherBatchStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BATCH_TONE[status]}`}>
      {planLabel(status)}
    </span>
  );
}

/**
 * Segment colours for a clinics-by-state bar. Checked with the dataviz validator: the grays are
 * deliberately low-chroma (inactive states), so every use pairs them with labelled counts.
 */
export const LIFECYCLE_COLOR: Record<TenantLifecycle, string> = {
  paying: '#059669',
  cancelling: '#d97706',
  trial: '#0a7f7e',
  'trial-ended': '#9ca3af',
  lapsed: '#f43f5e',
  suspended: '#374151',
};

/** A round initial for a clinic or person. */
export function Initial({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-teal-light font-semibold uppercase text-brand-teal-deep ${
        size === 'lg' ? 'size-12 text-lg' : 'size-8 text-xs'
      }`}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  );
}

/** Recent / quiet / dormant, from a last sign-in: within 7 days, within 30, older or never. */
export function activityOf(iso: string | null): { tone: string; label: string } {
  const days = iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity;
  if (days <= 7) return { tone: 'bg-emerald-500', label: 'Active this week' };
  if (days <= 30) return { tone: 'bg-amber-400', label: 'Quiet for over a week' };
  return { tone: 'bg-gray-300', label: iso ? 'No sign-in for 30 days' : 'Never signed in' };
}

/** A span of hours, rounded to the unit people use for it: "25 min", "6 h", "3 d". */
export function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

/** How long ago iso was, as hoursLabel text. */
export const hoursSince = (iso: string) => hoursLabel((Date.now() - new Date(iso).getTime()) / 3_600_000);

/** "in 5 days", "today", "3 days ago": how far a period end is from now. */
export function relDays(iso: string | null): { text: string; overdue: boolean; soon: boolean } | null {
  if (!iso) return null;
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d === 0) return { text: 'today', overdue: false, soon: true };
  if (d > 0) return { text: d === 1 ? 'tomorrow' : `in ${d} days`, overdue: false, soon: d <= 7 };
  return { text: d === -1 ? 'yesterday' : `${-d} days ago`, overdue: true, soon: false };
}

/**
 * Same strings as components/appointments/shared, which is a 'use client' module: imported into
 * a server component its exports arrive as client references, not strings.
 */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
export const FIELD =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 disabled:bg-gray-50 disabled:text-gray-500';

/** A labelled horizontal bar; widths share one scale (`max`) per list. */
export function BarRow({ label, value, max, right, href }: { label: string; value: number; max: number; right: string; href?: string }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        {href ? <Link href={href} className={LINK}>{label}</Link> : <span className="text-gray-700">{label}</span>}
        <span className="tabular-nums text-gray-900">{right}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100" aria-hidden="true">
        {value > 0 && <div className="h-full rounded-full bg-brand-teal-dark" style={{ width: `${Math.max(w, 2)}%` }} />}
      </div>
    </li>
  );
}
