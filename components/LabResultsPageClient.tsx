'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { SERIES, TableTwin, TipRow, useTooltip } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import type { LabResultsPageContext } from '@/lib/lab-results-page';
import { LAB_STATE, STATUS_ORDER, type LabStatus } from './lab-results/shared';

interface LabResult {
  _id: string;
  requestCode?: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  orderedBy?: { _id: string; name: string } | null;
  reviewedBy?: { _id: string; name: string } | null;
  request: { testType: string; urgency?: 'routine' | 'urgent' | 'stat' };
  status: LabStatus;
  orderDate: string;
  resultDate?: string;
  reviewedAt?: string;
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'> | null;
}

interface Insights {
  status: Partial<Record<LabStatus, number>>;
  abnormalToReview: number;
  waiting: { key: string; label: string; short: string; count: number }[];
  tests: { name: string; count: number }[];
  turnaround: { medianHours: number | null; results: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 20;

const swatch = (k: LabStatus) => LAB_STATE[k].fill ?? (LAB_STATE[k].muted ? '#E5E7EB' : '#FFFFFF');

const ROW_GRID =
  'lg:grid lg:grid-cols-[7rem_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_9.5rem_1.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  flask: 'M9 3h6m-5 0v5.5L4.6 18a2 2 0 001.7 3h11.4a2 2 0 001.7-3L14 8.5V3M7.5 14h9',
};

const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString('en-US', opts);

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function turnaroundLabel(hours: number) {
  if (hours < 1) return 'under an hour';
  if (hours < 36) return `${Math.round(hours)} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

function abnormalCount(flags?: LabResult['abnormalFlags']) {
  if (!flags) return { high: 0, low: 0 };
  const values = Object.values(flags);
  return { high: values.filter((v) => v === 'high').length, low: values.filter((v) => v === 'low').length };
}

function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const nums = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export default function LabResultsPageClient({ canWrite, isDoctor }: LabResultsPageContext) {
  const router = useRouter();
  const [mine, setMine] = useState(isDoctor);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<LabStatus | ''>('');
  const [abnormal, setAbnormal] = useState(false);
  const [waiting, setWaiting] = useState<{ key: string; label: string } | null>(null);
  const [urgency, setUrgency] = useState('');
  const [testType, setTestType] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (mine) params.set('mine', 'true');
  if (debounced.trim()) params.set('search', debounced.trim());
  if (status) params.set('status', status);
  if (abnormal) params.set('abnormal', 'true');
  if (waiting) params.set('waiting', waiting.key);
  if (urgency) params.set('urgency', urgency);
  if (testType) params.set('testType', testType);
  const listUrl = `/api/lab-results?${params}`;
  const list = useKeyedFetch<LabResult[]>(listUrl);
  const insights = useKeyedFetch<Insights>(`/api/lab-results/insights${mine ? '?mine=true' : ''}`);

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  // Waiting buckets mean "still out", so they replace a status filter (and vice versa).
  const pickStatus = (s: LabStatus | '') => {
    setStatus(s);
    setWaiting(null);
    setPage(1);
  };
  const pickWaiting = (w: { key: string; label: string } | null) => {
    setWaiting(w);
    setStatus('');
    setAbnormal(false);
    setPage(1);
  };

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (status) chips.push({ key: 'status', label: LAB_STATE[status].label, clear: () => pickStatus('') });
  if (abnormal) chips.push({ key: 'abn', label: 'Abnormal values', clear: () => (setAbnormal(false), setPage(1)) });
  if (waiting) chips.push({ key: 'wait', label: `Waiting ${waiting.label.toLowerCase()}`, clear: () => pickWaiting(null) });
  if (urgency) chips.push({ key: 'urg', label: urgency === 'stat' ? 'STAT' : 'Urgent', clear: () => (setUrgency(''), setPage(1)) });
  if (testType) chips.push({ key: 'test', label: testType, clear: () => (setTestType(null), setPage(1)) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setStatus('');
    setAbnormal(false);
    setWaiting(null);
    setUrgency('');
    setTestType(null);
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Lab results</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Tests ordered, results waiting for review, and what&apos;s still at the lab.</p>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Whose lab orders" className="inline-flex gap-1 rounded-md border border-gray-200 bg-white p-1">
              {[
                { on: !mine, label: 'Whole clinic', set: false },
                { on: mine, label: 'Mine', set: true },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={o.on}
                  onClick={() => {
                    setMine(o.set);
                    setPage(1);
                  }}
                  className={`rounded px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${FOCUS_RING} ${o.on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {canWrite && (
              <Link
                href="/lab-results/new"
                className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICONS.plus} />
                Order a test
              </Link>
            )}
          </div>
        </header>

        {insights.value ? (
          <LabInsights
            data={insights.value}
            mine={mine}
            status={status}
            abnormal={abnormal}
            waiting={waiting?.key ?? null}
            testType={testType}
            onStatus={(s) => pickStatus(status === s ? '' : s)}
            onReview={(abn) => {
              const same = status === 'completed' && abnormal === abn;
              pickStatus(same ? '' : 'completed');
              setAbnormal(same ? false : abn);
            }}
            onWaiting={(w) => pickWaiting(waiting?.key === w.key ? null : w)}
            onTest={(t) => {
              setTestType((cur) => (cur?.toLowerCase() === t.toLowerCase() ? null : t));
              setPage(1);
            }}
          />
        ) : insights.error ? null : (
          <div className="h-[236px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setDebounced(search);
                setPage(1);
              }}
            >
              <label htmlFor="lab-search" className="sr-only">
                Search lab results
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="lab-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, request code or test"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <label htmlFor="lab-status" className="sr-only">
              Status
            </label>
            <select id="lab-status" value={status} onChange={(e) => pickStatus(e.target.value as LabStatus | '')} className={`${FIELD} sm:w-44`}>
              <option value="">Any status</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {LAB_STATE[s].label}
                </option>
              ))}
            </select>
            <label htmlFor="lab-urgency" className="sr-only">
              Urgency
            </label>
            <select
              id="lab-urgency"
              value={urgency}
              onChange={(e) => {
                setUrgency(e.target.value);
                setPage(1);
              }}
              className={`${FIELD} sm:w-40`}
            >
              <option value="">Any urgency</option>
              <option value="stat">STAT</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
            </select>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className={`motion-chip-in inline-flex max-w-full items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                >
                  <span className="truncate">{c.label}</span>
                  <Svg d={ICONS.x} className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {list.error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">The lab results didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} lab orders${narrowed ? ' match' : ''}.` : ''}
        </p>

        {/* List */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Ordered</span>
            <span>Patient</span>
            <span>Test</span>
            <span>Ordered by</span>
            <span>Status</span>
            <span className="sr-only">Open</span>
          </div>

          {!loaded ? (
            list.error ? null : (
              <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="h-8 w-20 rounded bg-gray-100" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-40 rounded bg-gray-100" />
                      <span className="block h-3 w-24 rounded bg-gray-50" />
                    </span>
                    <span className="hidden h-3.5 w-36 rounded bg-gray-50 lg:block" />
                    <span className="h-5 w-24 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} mine={mine} canWrite={canWrite} onClear={clearAll} onWholeClinic={() => (setMine(false), setPage(1))} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((lab, i) => (
                <LabRow key={lab._id} lab={lab} index={i} onOpen={() => router.push(`/lab-results/${lab._id}`)} />
              ))}
            </ul>
          )}

          {loaded && total > 0 && (
            <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-mono text-gray-900">
                  {firstRow.toLocaleString('en-US')}–{lastRow.toLocaleString('en-US')}
                </span>{' '}
                of <span className="font-mono text-gray-900">{total.toLocaleString('en-US')}</span>
                {narrowed ? ' matching lab orders' : mine ? ' tests you ordered' : ' lab orders'}
              </p>
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || list.loading}
                    aria-label="Previous page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevL} />
                  </button>
                  {pageWindow(page, pages).map((n, i) =>
                    n === 'gap' ? (
                      <span key={`g${i}`} className="px-1.5 text-gray-400" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        disabled={list.loading}
                        aria-current={page === n ? 'page' : undefined}
                        aria-label={`Page ${n}`}
                        className={`min-w-9 rounded-md px-2 py-1.5 font-mono text-sm transition-colors ${FOCUS_RING} ${page === n ? 'bg-brand-teal-dark font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages || list.loading}
                    aria-label="Next page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevR} />
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function LabRow({ lab, index, onOpen }: { lab: LabResult; index: number; onOpen: () => void }) {
  const name = lab.patient ? `${lab.patient.firstName} ${lab.patient.lastName}` : 'Patient record unavailable';
  const st = LAB_STATE[lab.status] ?? LAB_STATE.ordered;
  const cancelled = lab.status === 'cancelled';
  const flags = abnormalCount(lab.abnormalFlags);
  const abn = flags.high + flags.low;
  const urgency = lab.request?.urgency;

  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="flex items-baseline gap-2 lg:block">
        <span className="block font-mono text-sm font-medium tabular-nums text-gray-900">{dayFmt(lab.orderDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span className="block text-xs text-gray-500">{ago(lab.orderDate)}</span>
      </span>

      <span className="min-w-0">
        <Link href={`/lab-results/${lab._id}`} className={`block truncate rounded font-semibold hover:text-brand-teal-deep ${cancelled ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'} ${FOCUS_RING}`}>
          {name}
        </Link>
        <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">
          {lab.requestCode ?? 'No request code'}
          {lab.patient?.patientCode ? ` · ${lab.patient.patientCode}` : ''}
        </span>
      </span>

      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
        <span className="truncate text-gray-800">{lab.request?.testType || 'Test not named'}</span>
        {urgency === 'stat' && <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">STAT</span>}
        {urgency === 'urgent' && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Urgent</span>}
      </span>

      <span className="truncate text-sm text-gray-700">{lab.orderedBy?.name ?? <span className="text-gray-400">Not recorded</span>}</span>

      <span className="min-w-0">
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
        {abn > 0 && !cancelled && (
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-700">
            <Svg d={ICONS.alert} className="h-3.5 w-3.5" />
            {[flags.high && `${flags.high} high`, flags.low && `${flags.low} low`].filter(Boolean).join(' · ')}
          </span>
        )}
        {abn === 0 && lab.resultDate && (
          <span className="mt-1 block font-mono text-xs text-gray-500">result {dayFmt(lab.resultDate, { month: 'short', day: 'numeric' })}</span>
        )}
      </span>

      <span className="hidden justify-end text-gray-400 transition-colors group-hover:text-gray-700 lg:flex" aria-hidden="true">
        <Svg d={ICONS.chevR} />
      </span>
    </li>
  );
}

function LabInsights({
  data,
  mine,
  status,
  abnormal,
  waiting,
  testType,
  onStatus,
  onReview,
  onWaiting,
  onTest,
}: {
  data: Insights;
  mine: boolean;
  status: LabStatus | '';
  abnormal: boolean;
  waiting: string | null;
  testType: string | null;
  onStatus: (s: LabStatus) => void;
  onReview: (abnormalOnly: boolean) => void;
  onWaiting: (w: { key: string; label: string }) => void;
  onTest: (t: string) => void;
}) {
  const tip = useTooltip();
  const toReview = data.status.completed || 0;
  const outstanding = (data.status.ordered || 0) + (data.status['in-progress'] || 0);
  const present = STATUS_ORDER.filter((k) => (data.status[k] || 0) > 0);
  const statusTotal = present.reduce((s, k) => s + (data.status[k] || 0), 0);
  const waitMax = Math.max(1, ...data.waiting.map((w) => w.count));
  const testMax = Math.max(1, ...data.tests.map((t) => t.count));

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-[1fr_1.15fr_1.15fr]">
        {/* To review */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="lab-review-h">
          <h2 id="lab-review-h" className="text-sm text-gray-600">
            Results to review
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toReview ? 'text-gray-900' : 'text-gray-500'}`}>{toReview.toLocaleString('en-US')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {data.abnormalToReview > 0 ? (
              <button
                type="button"
                aria-pressed={status === 'completed' && abnormal}
                onClick={() => onReview(true)}
                className={`inline-flex items-center gap-1 rounded font-semibold text-red-700 hover:text-red-800 ${FOCUS_RING}`}
              >
                <Svg d={ICONS.alert} className="h-3.5 w-3.5" />
                <span className="font-mono">{data.abnormalToReview}</span> with abnormal values
              </button>
            ) : (
              <span className="text-gray-500">{toReview ? 'none flagged abnormal' : mine ? 'nothing waiting for you' : 'nothing waiting'}</span>
            )}
            {toReview > 0 && (
              <button
                type="button"
                aria-pressed={status === 'completed' && !abnormal}
                onClick={() => onReview(false)}
                className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}
              >
                {status === 'completed' && !abnormal ? 'Show all' : 'List them'}
              </button>
            )}
          </div>
          {statusTotal > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {present.map((k, i) => (
                  <span
                    key={k}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${LAB_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                    style={{ flexGrow: data.status[k], flexBasis: 0, background: swatch(k), opacity: status && status !== k ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
                {present.map((k) => {
                  const on = status === k && !abnormal;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onStatus(k)}
                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-center gap-2 text-gray-700">
                          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${LAB_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-400'}`} style={{ background: swatch(k) }} />
                          <span className={on ? 'font-semibold text-gray-900' : ''}>{LAB_STATE[k].label}</span>
                        </span>
                        <span className="font-mono tabular-nums text-gray-900">{(data.status[k] || 0).toLocaleString('en-US')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* Still at the lab, by days waiting */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="lab-wait-h">
          <h2 id="lab-wait-h" className="text-sm text-gray-600">
            Still at the lab
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${outstanding ? 'text-gray-900' : 'text-gray-500'}`}>{outstanding.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {data.turnaround.medianHours !== null ? (
              <>
                results usually take <span className="font-mono text-gray-700">{turnaroundLabel(data.turnaround.medianHours)}</span>
              </>
            ) : (
              'no results back in the last 90 days'
            )}
          </p>
          <div className="mt-4 grid h-28 grid-cols-4 items-end gap-2" role="group" aria-label="Filter by days waiting">
            {data.waiting.map((w, i) => {
              const on = waiting === w.key;
              const late = w.key === '8+' && w.count > 0;
              return (
                <button
                  key={w.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Waiting ${w.label.toLowerCase()}: ${w.count} ${w.count === 1 ? 'order' : 'orders'}${on ? ', filtering' : ''}`}
                  onClick={() => onWaiting(w)}
                  onPointerEnter={(e) => tip.showFor(e.currentTarget, <TipRow color={SERIES.teal} kind="bar" label={`Waiting ${w.label.toLowerCase()}`} value={w.count} />)}
                  onPointerLeave={tip.hide}
                  onFocus={(e) => tip.showFor(e.currentTarget, <TipRow color={SERIES.teal} kind="bar" label={`Waiting ${w.label.toLowerCase()}`} value={w.count} />)}
                  onBlur={tip.hide}
                  className="group relative flex h-full flex-col items-center justify-end rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                >
                  <span className="absolute inset-0 rounded bg-gray-50 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                  <span className={`relative mb-1 font-mono text-xs tabular-nums ${late ? 'font-semibold text-red-700' : 'text-gray-700'}`}>{w.count}</span>
                  <span
                    aria-hidden="true"
                    className="motion-col-grow relative w-full max-w-10 rounded-t transition-opacity duration-200"
                    style={{
                      height: `${w.count > 0 ? Math.max(8, (w.count / waitMax) * 75) : 3}%`,
                      background: w.count > 0 ? (on ? '#0A7F7E' : SERIES.teal) : '#E5E7EB',
                      opacity: waiting && !on ? 0.3 : 1,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {data.waiting.map((w) => (
              <span key={w.key} className={`text-center font-mono text-xs ${waiting === w.key ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                {w.short}
              </span>
            ))}
          </div>
        </section>

        {/* Most ordered */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="lab-tests-h">
          <h2 id="lab-tests-h" className="text-sm text-gray-600">
            Ordered most, last 90 days
          </h2>
          {data.tests.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No tests ordered in the last 90 days.</p>
          ) : (
            <ul className="mt-3 space-y-1" role="group" aria-label="Filter by test">
              {data.tests.map((t, i) => {
                const on = testType?.toLowerCase() === t.name.toLowerCase();
                return (
                  <li key={t.name}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onTest(t.name)}
                      aria-label={`${t.name}: ${t.count} orders${on ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={`min-w-0 truncate ${on ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{t.name}</span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{t.count}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span
                          className="motion-bar-grow block h-full rounded-r"
                          style={{ width: `${(t.count / testMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: testType && !on ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <TableTwin
        caption="Orders still at the lab, by days waiting"
        head={['Waiting', 'Orders']}
        rows={data.waiting.map((w) => [w.label, w.count])}
      />
      {tip.node}
    </div>
  );
}

function Empty({ narrowed, mine, canWrite, onClear, onWholeClinic }: { narrowed: boolean; mine: boolean; canWrite: boolean; onClear: () => void; onWholeClinic: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No lab orders match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by request code or test name, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else if (mine) {
    body = (
      <>
        <p className="font-semibold text-gray-900">You haven&apos;t ordered any tests yet</p>
        <p className="mt-1 text-sm text-gray-500">Tests you order, here or from a visit, appear in this list.</p>
        <button type="button" onClick={onWholeClinic} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Show the whole clinic
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No lab orders yet</p>
        <p className="mt-1 text-sm text-gray-500">Order a test for a patient; results are entered or received here when they come back.</p>
        {canWrite && (
          <Link href="/lab-results/new" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            Order a test
          </Link>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.flask} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
