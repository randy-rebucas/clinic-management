import { LIFECYCLE_LABEL, type TenantLifecycle } from '@/lib/platform-metrics';
import type { SupportStatus } from '@/models/SupportRequest';
import type { VoucherBatchStatus } from '@/models/VoucherBatch';

/** Formatting and badges shared by the platform console's server and client components. */

export const usd = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits });

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
