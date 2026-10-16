'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { SERIES, TableTwin, TipRow, useTooltip } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import type { ReferralsPageContext } from '@/lib/referrals-page';
import { DIRECTIONS, DIRECTION_LABEL, LATE_AFTER_DAYS, type ReferralDirection, type ReferralStatus } from '@/lib/referrals';
import { REF_STATE, STATUS_ORDER, URGENCY_BADGE, daysSince, direction, fromLabel, shortDate, specialtyOf, toLabel, type Referral } from './referrals/shared';

interface Insights {
  status: Partial<Record<ReferralStatus, number>>;
  waiting: { key: string; label: string; short: string; count: number }[];
  oldestWaitingDays: number | null;
  urgentWaiting: number;
  toMe: number | null;
  destinations: { key: string; name: string; note: string; count: number }[];
  directions: Partial<Record<ReferralDirection, number>>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type Status = ReferralStatus | 'open' | '';
type Picked = { key: string; label: string } | null;

const PAGE_SIZE = 20;

const swatch = (k: ReferralStatus) => REF_STATE[k].fill ?? '#FFFFFF';

const ROW_GRID =
  'lg:grid lg:grid-cols-[7rem_minmax(0,1.25fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_9.5rem_1.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  route: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
};

function ago(iso: string) {
  const days = daysSince(iso);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
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

export default function ReferralsPageClient({ canWrite, hasDoctorProfile, isDoctor }: ReferralsPageContext) {
  const router = useRouter();
  const [mine, setMine] = useState(isDoctor && hasDoctorProfile);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<Status>('');
  const [waiting, setWaiting] = useState<Picked>(null);
  const [urgency, setUrgency] = useState('');
  const [dir, setDir] = useState<ReferralDirection | ''>('');
  const [to, setTo] = useState<Picked>(null);
  const [toMe, setToMe] = useState(false);
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
  if (toMe) params.set('toMe', 'true');
  if (debounced.trim()) params.set('search', debounced.trim());
  if (status) params.set('status', status);
  if (waiting) params.set('waiting', waiting.key);
  if (urgency) params.set('urgency', urgency);
  if (dir) params.set('direction', dir);
  if (to) params.set('to', to.key);
  const listUrl = `/api/referrals?${params}`;
  const list = useKeyedFetch<Referral[]>(listUrl);
  const insights = useKeyedFetch<Insights>(`/api/referrals/insights${mine ? '?mine=true' : ''}`);

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  // Days waiting and "waiting for your answer" both mean "still waiting", so they replace a status filter.
  const pickStatus = (s: Status) => {
    setStatus(s);
    setWaiting(null);
    setToMe(false);
    setPage(1);
  };
  const pickWaiting = (w: Picked) => {
    setWaiting(w);
    setStatus('');
    setPage(1);
  };
  const pickToMe = (on: boolean) => {
    setToMe(on);
    setStatus('');
    setPage(1);
  };
  const pickUrgency = (u: string) => {
    setUrgency(u);
    setPage(1);
  };

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (toMe) chips.push({ key: 'me', label: 'Waiting for your answer', clear: () => pickToMe(false) });
  if (status) chips.push({ key: 'status', label: status === 'open' ? 'Still open' : REF_STATE[status].label, clear: () => pickStatus('') });
  if (waiting) chips.push({ key: 'wait', label: `Waiting ${waiting.label.toLowerCase()}`, clear: () => pickWaiting(null) });
  if (urgency) chips.push({ key: 'urg', label: urgency === 'high' ? 'Urgent or STAT' : urgency === 'stat' ? 'STAT' : urgency === 'urgent' ? 'Urgent' : 'Routine', clear: () => pickUrgency('') });
  if (dir) chips.push({ key: 'dir', label: DIRECTION_LABEL[dir].short, clear: () => (setDir(''), setPage(1)) });
  if (to) chips.push({ key: 'to', label: `To ${to.label}`, clear: () => (setTo(null), setPage(1)) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setStatus('');
    setWaiting(null);
    setUrgency('');
    setDir('');
    setTo(null);
    setToMe(false);
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Referrals</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Patients sent to other doctors, patients sent to us, and the replies still to come.</p>
          </div>
          <div className="flex items-center gap-2">
            {hasDoctorProfile && (
              <div role="group" aria-label="Whose referrals" className="inline-flex gap-1 rounded-md border border-gray-200 bg-white p-1">
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
            )}
            {canWrite && (
              <Link
                href="/referrals/new"
                className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICONS.plus} />
                Refer a patient
              </Link>
            )}
          </div>
        </header>

        {insights.value ? (
          <ReferralInsights
            data={insights.value}
            mine={mine}
            status={status}
            waiting={waiting?.key ?? null}
            urgency={urgency}
            toMe={toMe}
            to={to?.key ?? null}
            dir={dir}
            onStatus={(s) => pickStatus(status === s ? '' : s)}
            onWaiting={(w) => pickWaiting(waiting?.key === w.key ? null : w)}
            onUrgent={() => {
              const on = urgency === 'high' && status === 'pending';
              pickStatus(on ? '' : 'pending');
              pickUrgency(on ? '' : 'high');
            }}
            onToMe={() => pickToMe(!toMe)}
            onTo={(d) => {
              setTo((cur) => (cur?.key === d.key ? null : d));
              setPage(1);
            }}
            onDir={(d) => {
              setDir((cur) => (cur === d ? '' : d));
              setPage(1);
            }}
          />
        ) : insights.error ? null : (
          <div className="h-[248px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
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
              <label htmlFor="ref-search" className="sr-only">
                Search referrals
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="ref-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, doctor, clinic, code or reason"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <label htmlFor="ref-status" className="sr-only">
              Status
            </label>
            <select id="ref-status" value={status} onChange={(e) => pickStatus(e.target.value as Status)} className={`${FIELD} sm:w-44`}>
              <option value="">Any status</option>
              <option value="open">Still open</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {REF_STATE[s].label}
                </option>
              ))}
            </select>
            <label htmlFor="ref-direction" className="sr-only">
              Direction
            </label>
            <select
              id="ref-direction"
              value={dir}
              onChange={(e) => {
                setDir(e.target.value as ReferralDirection | '');
                setPage(1);
              }}
              className={`${FIELD} sm:w-44`}
            >
              <option value="">Any direction</option>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {DIRECTION_LABEL[d].short}
                </option>
              ))}
            </select>
            <label htmlFor="ref-urgency" className="sr-only">
              Urgency
            </label>
            <select id="ref-urgency" value={urgency} onChange={(e) => pickUrgency(e.target.value)} className={`${FIELD} sm:w-40`}>
              <option value="">Any urgency</option>
              <option value="high">Urgent or STAT</option>
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
            <p className="text-sm font-medium text-red-800">The referrals didn’t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} referrals${narrowed ? ' match' : ''}.` : ''}
        </p>

        {/* List */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Referred</span>
            <span>Patient</span>
            <span>From → to</span>
            <span>Reason</span>
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
                    <span className="hidden h-3.5 w-48 rounded bg-gray-50 lg:block" />
                    <span className="h-5 w-28 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} mine={mine} canWrite={canWrite} onClear={clearAll} onWholeClinic={() => (setMine(false), setPage(1))} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((r, i) => (
                <ReferralRow key={r._id} referral={r} index={i} onOpen={() => router.push(`/referrals/${r._id}`)} />
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
                {narrowed ? ' matching referrals' : mine ? ' referrals you sent or receive' : ' referrals'}
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

/** The state in words under the badge: how long a reply has taken, or when the step happened. */
function StateLine({ r }: { r: Referral }) {
  if (r.status === 'pending') {
    const days = daysSince(r.referredDate);
    const late = days > LATE_AFTER_DAYS;
    const veryLate = days > 2 * LATE_AFTER_DAYS;
    return (
      <span className={`mt-1 flex items-center gap-1 text-xs ${veryLate ? 'font-semibold text-red-700' : late ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>
        {late && <Svg d={ICONS.alert} className="h-3.5 w-3.5" />}
        <span>
          {late ? 'Long wait · ' : ''}
          <span className="font-mono">{days === 0 ? 'sent today' : `${days} ${days === 1 ? 'day' : 'days'}`}</span>
        </span>
      </span>
    );
  }
  const when = r.status === 'accepted' ? r.acceptedDate : r.status === 'completed' ? r.completedDate : r.status === 'declined' ? r.declinedDate : null;
  if (!when) return null;
  const word = r.status === 'accepted' ? 'accepted' : r.status === 'completed' ? 'seen' : 'declined';
  return (
    <span className="mt-1 block text-xs text-gray-500">
      {word} <span className="font-mono">{new Date(when).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
    </span>
  );
}

function ReferralRow({ referral: r, index, onOpen }: { referral: Referral; index: number; onOpen: () => void }) {
  const name = r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : 'Patient record unavailable';
  const st = REF_STATE[r.status] ?? REF_STATE.pending;
  const cancelled = r.status === 'cancelled';
  const urgency = r.urgency && r.urgency !== 'routine' ? URGENCY_BADGE[r.urgency] : undefined;
  const d = direction(r);
  const detail = [DIRECTION_LABEL[d].short, r.specialty || specialtyOf(r.receivingDoctor)].filter(Boolean).join(' · ');

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
        <span className="block font-mono text-sm font-medium tabular-nums text-gray-900">{shortDate(r.referredDate)}</span>
        <span className="block text-xs text-gray-500">{ago(r.referredDate)}</span>
      </span>

      <span className="min-w-0">
        <Link href={`/referrals/${r._id}`} className={`block truncate rounded font-semibold hover:text-brand-teal-deep ${cancelled ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'} ${FOCUS_RING}`}>
          {name}
        </Link>
        <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">
          {r.referralCode ?? 'No code'}
          {r.patient?.patientCode ? ` · ${r.patient.patientCode}` : ''}
        </span>
      </span>

      <span className="min-w-0 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 text-gray-800">
          <span className="truncate">{fromLabel(r)}</span>
          <Svg d={ICONS.arrow} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="truncate font-medium text-gray-900">{toLabel(r)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{detail}</span>
      </span>

      <span className="line-clamp-2 text-sm text-gray-700">{r.reason}</span>

      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
          {urgency && !cancelled && <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${urgency.badge}`}>{urgency.label}</span>}
        </span>
        <StateLine r={r} />
      </span>

      <span className="hidden justify-end text-gray-400 transition-colors group-hover:text-gray-700 lg:flex" aria-hidden="true">
        <Svg d={ICONS.chevR} />
      </span>
    </li>
  );
}

function ReferralInsights({
  data,
  mine,
  status,
  waiting,
  urgency,
  toMe,
  to,
  dir,
  onStatus,
  onWaiting,
  onUrgent,
  onToMe,
  onTo,
  onDir,
}: {
  data: Insights;
  mine: boolean;
  status: Status;
  waiting: string | null;
  urgency: string;
  toMe: boolean;
  to: string | null;
  dir: ReferralDirection | '';
  onStatus: (s: ReferralStatus) => void;
  onWaiting: (w: { key: string; label: string }) => void;
  onUrgent: () => void;
  onToMe: () => void;
  onTo: (d: { key: string; label: string }) => void;
  onDir: (d: ReferralDirection) => void;
}) {
  const tip = useTooltip();
  const pending = data.status.pending || 0;
  const present = STATUS_ORDER.filter((k) => (data.status[k] || 0) > 0);
  const statusTotal = present.reduce((s, k) => s + (data.status[k] || 0), 0);
  const waitMax = Math.max(1, ...data.waiting.map((w) => w.count));
  const destMax = Math.max(1, ...data.destinations.map((d) => d.count));
  const urgentOn = urgency === 'high' && status === 'pending';
  const lateKeys = new Set(['8-14', '15+']);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-[1.15fr_1fr_1.15fr]">
        {/* Waiting for a reply, by days waiting */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="ref-wait-h">
          <h2 id="ref-wait-h" className="text-sm text-gray-600">
            Waiting for a reply
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${pending ? 'text-gray-900' : 'text-gray-500'}`}>{pending.toLocaleString('en-US')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {data.urgentWaiting > 0 ? (
              <button type="button" aria-pressed={urgentOn} onClick={onUrgent} className={`inline-flex items-center gap-1 rounded font-semibold text-red-700 hover:text-red-800 ${FOCUS_RING}`}>
                <Svg d={ICONS.alert} className="h-3.5 w-3.5" />
                <span className="font-mono">{data.urgentWaiting}</span> urgent or STAT
              </button>
            ) : (
              <span className="text-gray-500">{pending ? 'none urgent' : mine ? 'nothing waiting on your referrals' : 'nothing waiting'}</span>
            )}
            {data.toMe !== null && data.toMe > 0 && (
              <button type="button" aria-pressed={toMe} onClick={onToMe} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                <span className="font-mono">{data.toMe}</span> waiting for your answer
              </button>
            )}
          </div>
          <div className="mt-4 grid h-24 grid-cols-4 items-end gap-2" role="group" aria-label="Filter by days waiting">
            {data.waiting.map((w, i) => {
              const on = waiting === w.key;
              const late = lateKeys.has(w.key) && w.count > 0;
              const tipRow = <TipRow color={SERIES.teal} kind="bar" label={`Waiting ${w.label.toLowerCase()}`} value={w.count} />;
              return (
                <button
                  key={w.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Waiting ${w.label.toLowerCase()}: ${w.count} ${w.count === 1 ? 'referral' : 'referrals'}${on ? ', filtering' : ''}`}
                  onClick={() => onWaiting(w)}
                  onPointerEnter={(e) => tip.showFor(e.currentTarget, tipRow)}
                  onPointerLeave={tip.hide}
                  onFocus={(e) => tip.showFor(e.currentTarget, tipRow)}
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
          <p className="mt-3 text-xs text-gray-500">
            {data.oldestWaitingDays !== null && data.oldestWaitingDays > LATE_AFTER_DAYS ? (
              <>
                The oldest has waited <span className="font-mono text-gray-700">{data.oldestWaitingDays} days</span>. Urgent ones are emailed to the referring doctor after {LATE_AFTER_DAYS}.
              </>
            ) : (
              <>Urgent referrals still waiting after {LATE_AFTER_DAYS} days are emailed to the referring doctor.</>
            )}
          </p>
        </section>

        {/* Where they stand */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="ref-status-h">
          <h2 id="ref-status-h" className="text-sm text-gray-600">
            Where they stand
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${statusTotal ? 'text-gray-900' : 'text-gray-500'}`}>{statusTotal.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">{statusTotal ? (mine ? 'referrals you sent or receive' : 'referrals on file') : 'no referrals yet'}</p>
          {statusTotal > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {present.map((k, i) => (
                  <span
                    key={k}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${REF_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                    style={{ flexGrow: data.status[k], flexBasis: 0, background: swatch(k), opacity: status && status !== k ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
                {present.map((k) => {
                  const on = status === k;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onStatus(k)}
                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-center gap-2 text-gray-700">
                          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${REF_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-400'}`} style={{ background: swatch(k) }} />
                          <span className={on ? 'font-semibold text-gray-900' : ''}>{REF_STATE[k].label}</span>
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

        {/* Sent to most */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="ref-dest-h">
          <h2 id="ref-dest-h" className="text-sm text-gray-600">
            Referred to most, last 12 months
          </h2>
          {data.destinations.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No referrals to a named doctor or clinic in the last 12 months.</p>
          ) : (
            <ul className="mt-3 space-y-1" role="group" aria-label="Filter by where the patient was referred">
              {data.destinations.map((d, i) => {
                const on = to === d.key;
                return (
                  <li key={d.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onTo({ key: d.key, label: d.name })}
                      aria-label={`${d.name}, ${d.note}: ${d.count} referrals${on ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className={on ? 'font-semibold text-gray-900' : 'text-gray-700'}>{d.name}</span>
                          <span className="text-xs text-gray-500"> · {d.note}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{d.count}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span
                          className="motion-bar-grow block h-full rounded-r"
                          style={{ width: `${(d.count / destMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: to && !on ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3" role="group" aria-label="Filter by direction">
            {DIRECTIONS.map((d) => {
              const n = data.directions[d] || 0;
              const on = dir === d;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onDir(d)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${FOCUS_RING} ${on ? 'border-brand-teal-dark bg-brand-teal-dark text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'}`}
                >
                  {DIRECTION_LABEL[d].short}
                  <span className={`font-mono tabular-nums ${on ? 'text-white' : 'text-gray-900'}`}>{n}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <TableTwin caption="Referrals waiting for a reply, by days waiting" head={['Waiting', 'Referrals']} rows={data.waiting.map((w) => [w.label, w.count])} />
      {tip.node}
    </div>
  );
}

function Empty({ narrowed, mine, canWrite, onClear, onWholeClinic }: { narrowed: boolean; mine: boolean; canWrite: boolean; onClear: () => void; onWholeClinic: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No referrals match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by code, doctor or clinic, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else if (mine) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No referrals to or from you yet</p>
        <p className="mt-1 text-sm text-gray-500">Referrals you make, and patients referred to you, appear in this list.</p>
        <button type="button" onClick={onWholeClinic} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Show the whole clinic
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No referrals yet</p>
        <p className="mt-1 text-sm text-gray-500">Refer a patient to a doctor here or outside, or record a patient another clinic sent you.</p>
        {canWrite && (
          <Link href="/referrals/new" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            Refer a patient
          </Link>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.route} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
