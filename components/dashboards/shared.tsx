'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type Period = 'today' | 'week' | 'month';

export interface DashboardAppointment {
  _id: string;
  appointmentCode?: string;
  patient: string;
  doctor?: string;
  date: string;
  time: string;
  status: string;
}

const PERIOD_PHRASE: Record<Period, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

/** "Visits Today", "Revenue This Week", ... */
export function periodTitle(noun: string, period: string) {
  return `${noun} ${PERIOD_PHRASE[period as Period] ?? PERIOD_PHRASE.today}`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface DashboardState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  retry: () => void;
  /** Client clock when `data` arrived; lets live views (the now-line) advance between fetches. */
  receivedAt: number;
}

export function useDashboardData<T>(period: Period): DashboardState<T> {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [reloadCount, setReloadCount] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const requestKey = `${period}:${reloadCount}`;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/reports/dashboard/role-based?period=${period}`, {
          signal: controller.signal,
        });

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Request failed (${res.status})`);
        }

        setData(json.data);
        setReceivedAt(Date.now());
        setFailure(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch dashboard data:', error);
        setFailure({
          key: requestKey,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        if (!controller.signal.aborted) setSettledKey(requestKey);
      }
    }

    load();
    return () => controller.abort();
  }, [router, period, requestKey]);

  return {
    data,
    error: failure?.key === requestKey ? failure.message : null,
    loading: settledKey !== requestKey,
    retry: () => setReloadCount((n) => n + 1),
    receivedAt,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(value: string) {
  if (!value) return '—';
  const date = new Date(`2000-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function makeCurrencyFormatter(currency: string) {
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: 2 });
  } catch {
    formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
  }
  return (amount: number) => formatter.format(amount || 0);
}

/** ₱12.4K style, for chart axes. */
export function makeCompactCurrencyFormatter(currency: string) {
  let formatter: Intl.NumberFormat;
  try {
    formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
  } catch {
    formatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
  }
  return (amount: number) => formatter.format(amount || 0);
}

export const formatCount = (v: number) => Math.round(v).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Icons (outline, 1.75px stroke to match the public site)
// ---------------------------------------------------------------------------

const ICON_PATHS = {
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  user: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  report: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  currency: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  alert: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  plus: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  queue: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  prescription: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-2.387a1 1 0 00-1.414 0l-3.293 3.293a1 1 0 01-1.414 0l-3.293-3.293a1 1 0 00-1.414 0L4.547 15.428a2 2 0 00-.547 1.022v4.55a2 2 0 002 2h12a2 2 0 002-2v-4.55a2 2 0 00-.547-1.022zM9 7h6m-6 4h6m-2 4h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  arrow: 'M13 7l5 5m0 0l-5 5m5-5H6',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, className = 'w-5 h-5' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={ICON_PATHS[name]} />
    </svg>
  );
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';

/**
 * Hairline-ruled grid, as on the public site's quick-access row. Cells draw their own
 * right/bottom rules and the frame clips the outer ones, so a ragged last row stays white.
 */
const RULED_FRAME = 'rounded-lg border border-gray-200 bg-white overflow-hidden';
const RULED_GRID = 'grid -mr-px -mb-px';
const RULED_CELL = 'border-r border-b border-gray-200';

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function PeriodControl({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div role="group" aria-label="Reporting period" className="inline-flex p-1 gap-1 rounded-md border border-gray-200 bg-white">
      {PERIODS.map(({ value, label }) => {
        const active = period === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={`px-3.5 py-1.5 rounded text-sm font-semibold transition-colors duration-150 ${FOCUS_RING} ${
              active ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function LoadingSkeleton({ stats }: { stats: number }) {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-hidden="true">
      <div className={RULED_FRAME}>
        <div className={`${RULED_GRID} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`}>
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className={`${RULED_CELL} p-5 h-[116px] flex flex-col justify-between`}>
              <div className="h-3 w-28 rounded bg-gray-100" />
              <div className="h-7 w-20 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 rounded-lg border border-gray-200 bg-white" />
        <div className="h-72 rounded-lg border border-gray-200 bg-white" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-md bg-red-50 text-red-600 mb-4">
        <Icon name="alert" className="w-5 h-5" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 tracking-tight">Dashboard couldn&apos;t load</h2>
      <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto leading-relaxed">
        The figures for this period didn&apos;t come through ({message}). Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand-teal-dark hover:bg-brand-teal-deep text-white text-sm font-semibold transition-colors duration-150 ${FOCUS_RING}`}
      >
        <Icon name="refresh" className="w-4 h-4" />
        Try again
      </button>
    </div>
  );
}

interface DashboardShellProps<T> {
  title: string;
  subtitle: string;
  period: Period;
  onPeriodChange: (p: Period) => void;
  state: DashboardState<T>;
  skeletonStats?: number;
  children: (data: T) => ReactNode;
}

export function DashboardShell<T>({
  title,
  subtitle,
  period,
  onPeriodChange,
  state,
  skeletonStats = 3,
  children,
}: DashboardShellProps<T>) {
  const { data, error, loading, retry } = state;
  const refreshing = loading && data !== null;

  let body: ReactNode;
  if (error) body = <ErrorState message={error} onRetry={retry} />;
  else if (!data) body = <LoadingSkeleton stats={skeletonStats} />;
  else
    body = (
      <div className={`flex flex-col gap-6 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
        {children(data)}
      </div>
    );

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-8" aria-busy={loading}>
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">{subtitle}</p>
          </div>
          <PeriodControl period={period} onChange={onPeriodChange} />
        </header>
        <span className="sr-only" aria-live="polite">
          {loading ? 'Loading dashboard…' : error ? '' : 'Dashboard updated'}
        </span>
        {body}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface StatItem {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  href: string;
  icon: IconName;
  /** Marks a figure that needs attention (e.g. unpaid invoices). Colour carries meaning only. */
  alert?: boolean;
}

export function StatGrid({ items }: { items: (StatItem | false | null | undefined)[] }) {
  const visible = items.filter(Boolean) as StatItem[];
  if (visible.length === 0) return null;

  return (
    <div className={RULED_FRAME}>
      <div className={`${RULED_GRID} grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`}>
        {visible.map((stat) => (
          <Link
            key={`${stat.href}:${stat.title}`}
            href={stat.href}
            className={`group ${RULED_CELL} p-5 flex items-start justify-between gap-4 hover:bg-brand-teal-light/40 transition-colors duration-150 focus-visible:outline-none focus-visible:bg-brand-teal-light/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal`}
          >
            <div className="min-w-0">
              <p className="text-sm text-gray-600">{stat.title}</p>
              <p className="mt-2 font-mono text-2xl sm:text-3xl font-semibold text-gray-900 tabular-nums break-words">
                {stat.value}
              </p>
              {stat.subtitle && (
                <p className={`mt-1 text-sm font-medium tabular-nums ${stat.alert ? 'text-red-700' : 'text-gray-600'}`}>
                  {stat.subtitle}
                </p>
              )}
            </div>
            <span
              className={`shrink-0 w-10 h-10 rounded-md flex items-center justify-center transition-colors duration-150 ${
                stat.alert
                  ? 'bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white'
                  : 'bg-brand-teal-light text-brand-teal-dark group-hover:bg-brand-teal group-hover:text-white'
              }`}
            >
              <Icon name={stat.icon} className="w-5 h-5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels and lists
// ---------------------------------------------------------------------------

interface PanelProps {
  title: string;
  subtitle?: ReactNode;
  className?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, viewAllHref, viewAllLabel = 'View all', className = '', children }: PanelProps) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col ${className}`}>
      <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900 tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className={`shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep transition-colors rounded ${FOCUS_RING}`}
          >
            {viewAllLabel}
            <Icon name="arrow" className="w-4 h-4" />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function EmptyState({ icon = 'calendar', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-gray-100 text-gray-500 mb-3">
        <Icon name={icon} className="w-5 h-5" />
      </div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {hint && <p className="text-sm text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  scheduled: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30',
  confirmed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rescheduled: 'bg-amber-50 text-amber-800 ring-amber-200',
  completed: 'bg-gray-100 text-gray-700 ring-gray-200',
  'no-show': 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/-/g, ' ') : 'Unknown';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ring-1 ring-inset ${
        STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
      }`}
    >
      {label}
    </span>
  );
}

interface ListRowProps {
  href: string;
  primary: string;
  secondary?: string;
  meta: ReactNode;
  aside?: ReactNode;
}

function ListRow({ href, primary, secondary, meta, aside }: ListRowProps) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors duration-150 focus-visible:outline-none focus-visible:bg-brand-teal-light/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{primary}</p>
          {secondary && <p className="text-sm text-gray-500 mt-0.5 truncate">{secondary}</p>}
        </div>
        <div className="shrink-0 text-right flex flex-col items-end gap-1">
          <p className="font-mono text-sm font-medium text-gray-900 tabular-nums">{meta}</p>
          {aside}
        </div>
      </Link>
    </li>
  );
}

interface AppointmentListProps {
  appointments: DashboardAppointment[] | undefined;
  /** 'time' for same-day lists (shows status), 'datetime' for upcoming lists. */
  variant: 'time' | 'datetime';
  showDoctor?: boolean;
  emptyTitle: string;
  emptyHint?: string;
  limit?: number;
}

export function AppointmentList({
  appointments,
  variant,
  showDoctor = true,
  emptyTitle,
  emptyHint,
  limit = 5,
}: AppointmentListProps) {
  const rows = (appointments ?? []).slice(0, limit);
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((apt) => (
        <ListRow
          key={apt._id}
          href={`/appointments/${apt._id}`}
          primary={apt.patient}
          secondary={showDoctor ? apt.doctor : undefined}
          meta={variant === 'time' ? formatTime(apt.time) : formatDate(apt.date)}
          aside={
            variant === 'time' ? (
              <StatusBadge status={apt.status} />
            ) : (
              <span className="font-mono text-xs text-gray-500 tabular-nums">{formatTime(apt.time)}</span>
            )
          }
        />
      ))}
    </ul>
  );
}

export function VisitList({
  visits,
  emptyTitle,
  emptyHint,
}: {
  visits: { _id: string; patient: string; date: string; diagnosis: string }[] | undefined;
  emptyTitle: string;
  emptyHint?: string;
}) {
  const rows = visits ?? [];
  if (rows.length === 0) return <EmptyState icon="document" title={emptyTitle} hint={emptyHint} />;

  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((visit) => (
        <ListRow
          key={visit._id}
          href={`/visits/${visit._id}`}
          primary={visit.patient}
          secondary={visit.diagnosis && visit.diagnosis !== 'N/A' ? visit.diagnosis : 'No diagnosis recorded'}
          meta={formatDate(visit.date)}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Summary figures (ruled row of label + mono numeral)
// ---------------------------------------------------------------------------

export interface Figure {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  /** Semantic status colour for the numeral, when the figure is a state. */
  status?: 'success' | 'warning' | 'danger';
}

const FIGURE_STATUS: Record<NonNullable<Figure['status']>, string> = {
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
};

export function FigureRow({ figures }: { figures: Figure[] }) {
  return (
    <div className="overflow-hidden">
      <dl className={`${RULED_GRID} grid-cols-2 lg:grid-cols-4`}>
        {figures.map((figure) => (
          <div key={figure.label} className={`${RULED_CELL} px-5 py-4`}>
            <dt className="text-sm text-gray-600">{figure.label}</dt>
            <dd
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                figure.status ? FIGURE_STATUS[figure.status] : 'text-gray-900'
              }`}
            >
              {figure.value}
            </dd>
            {figure.detail && <dd className="font-mono text-xs text-gray-500 tabular-nums mt-0.5">{figure.detail}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick actions (the public site's quick-access grid)
// ---------------------------------------------------------------------------

export interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: IconName;
}

export function QuickActions({ items }: { items: (QuickAction | false | null | undefined)[] }) {
  const visible = items.filter(Boolean) as QuickAction[];
  if (visible.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-gray-900 tracking-tight">Quick actions</h2>
      <div className={RULED_FRAME}>
        <div className={`${RULED_GRID} grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`}>
          {visible.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group ${RULED_CELL} p-5 hover:bg-brand-teal-light/60 transition-colors duration-150 focus-visible:outline-none focus-visible:bg-brand-teal-light/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal`}
            >
              <span className="w-10 h-10 rounded-md bg-brand-teal-light text-brand-teal-dark flex items-center justify-center mb-4 group-hover:bg-brand-teal group-hover:text-white transition-colors duration-150">
                <Icon name={action.icon} className="w-5 h-5" />
              </span>
              <span className="block font-semibold text-gray-900">{action.title}</span>
              <span className="block text-sm text-gray-500 mt-0.5">{action.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
