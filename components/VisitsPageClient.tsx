'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { SERIES, STATE, TableTwin, TipRow, useTooltip } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { vitalsSummary, type Vitals } from './queue/VitalsModal';
import { STATUS_BADGE, VISIT_TYPES, visitTypeLabel, type VisitStatus } from './visits/shared';
import type { VisitsPageContext } from '@/lib/visits-page';

interface Visit {
  _id: string;
  visitCode: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  provider?: { _id: string; name: string } | null;
  date: string;
  visitType: string;
  chiefComplaint?: string;
  diagnoses: { code?: string; description?: string; primary?: boolean }[];
  status: VisitStatus;
  followUpDate?: string;
  digitalSignature?: { providerName: string; signedAt: string } | null;
}

interface Insights {
  today: string;
  status: Partial<Record<VisitStatus, number>>;
  days: { date: string; visits: number }[];
  diagnoses: { code: string; description: string; count: number }[];
}

interface ReadyEntry {
  _id: string;
  queueNumber: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  patientName: string;
  doctor?: { firstName: string; lastName: string } | null;
  startedAt?: string;
  queuedAt: string;
  vitals?: Vitals;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 20;

/** Visit states borrow the validated appointment-state hues: unfinished amber, in progress blue, done teal. */
const VISIT_STATE: Record<VisitStatus, { label: string; fill: string | null; hint: string }> = {
  draft: { label: 'Draft', fill: STATE.pending.fill, hint: 'Started, not saved as a note yet' },
  open: { label: 'Open', fill: STATE.upcoming.fill, hint: 'Saved, still being written' },
  closed: { label: 'Closed', fill: STATE.completed.fill, hint: 'Finished notes' },
  cancelled: { label: 'Cancelled', fill: null, hint: 'Voided visits' },
};
const STATUS_ORDER: VisitStatus[] = ['draft', 'open', 'closed', 'cancelled'];

const TYPES = VISIT_TYPES;
const typeLabel = visitTypeLabel;

const ROW_GRID =
  'lg:grid lg:grid-cols-[7rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.6fr)_6.5rem_1.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  pen: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', opts);
const timeFmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

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

export default function VisitsPageClient({ canWrite, canSeeQueue, isDoctor, doctorProfileId }: VisitsPageContext) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when the new-visit form sends the user back here.
  const [notice, setNotice] = useState<string | null>(() => (searchParams.get('success') === 'true' ? 'The visit was saved.' : null));
  const [mine, setMine] = useState(isDoctor);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<VisitStatus | ''>('');
  const [visitType, setVisitType] = useState('');
  const [diagnosis, setDiagnosis] = useState<{ code: string; description: string } | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!notice) return;
    window.history.replaceState({}, '', '/visits');
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  // --- Data -----------------------------------------------------------------

  const listParams = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (mine) listParams.set('mine', 'true');
  if (debounced.trim()) listParams.set('search', debounced.trim());
  if (status) listParams.set('status', status);
  if (visitType) listParams.set('visitType', visitType);
  if (diagnosis) listParams.set('diagnosis', diagnosis.code);
  const listUrl = `/api/visits?${listParams}`;

  const list = useKeyedFetch<Visit[]>(listUrl);
  const insights = useKeyedFetch<Insights>(`/api/visits/insights${mine ? '?mine=true' : ''}`);
  const readyUrl = canSeeQueue ? `/api/queue?${new URLSearchParams({ status: 'in-progress', ...(doctorProfileId ? { doctorId: doctorProfileId } : {}) })}` : null;
  const ready = useKeyedFetch<ReadyEntry[]>(readyUrl);

  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;

  const visits = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;

  // --- Filters --------------------------------------------------------------

  const reset = useCallback(() => setPage(1), []);
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (status) chips.push({ key: 'status', label: VISIT_STATE[status].label, clear: () => (setStatus(''), reset()) });
  if (visitType) chips.push({ key: 'type', label: typeLabel(visitType), clear: () => (setVisitType(''), reset()) });
  if (diagnosis) chips.push({ key: 'dx', label: `${diagnosis.code}${diagnosis.description ? ` · ${diagnosis.description}` : ''}`, clear: () => (setDiagnosis(null), reset()) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setStatus('');
    setVisitType('');
    setDiagnosis(null);
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  const total = pagination?.total ?? visits.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);
  const readyList = useMemo(() => ready.value ?? [], [ready.value]);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Visits</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Consultation notes, newest first.</p>
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Whose visits" className="inline-flex gap-1 rounded-md border border-gray-200 bg-white p-1">
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
                href="/visits/new"
                className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICONS.plus} />
                New visit
              </Link>
            )}
          </div>
        </header>

        {notice && (
          <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            <p>{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.x} />
            </button>
          </div>
        )}

        {/* Patients called in and waiting for their note */}
        {canWrite && readyList.length > 0 && <ReadyPanel entries={readyList} forDoctor={Boolean(doctorProfileId)} />}

        {/* At a glance: status rows and diagnoses filter the list */}
        {insights.value ? (
          <VisitInsights
            data={insights.value}
            mine={mine}
            status={status}
            diagnosis={diagnosis?.code ?? null}
            onStatus={(s) => {
              setStatus((cur) => (cur === s ? '' : s));
              setPage(1);
            }}
            onDiagnosis={(d) => {
              setDiagnosis((cur) => (cur?.code === d.code ? null : d));
              setPage(1);
            }}
          />
        ) : insights.error ? null : (
          <div className="h-[220px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
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
              <label htmlFor="visit-search" className="sr-only">
                Search visits
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="visit-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient name, patient code, phone or visit code"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <label htmlFor="visit-status" className="sr-only">
              Status
            </label>
            <select
              id="visit-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as VisitStatus | '');
                setPage(1);
              }}
              className={`${FIELD} sm:w-40`}
            >
              <option value="">Any status</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {VISIT_STATE[s].label}
                </option>
              ))}
            </select>
            <label htmlFor="visit-type" className="sr-only">
              Visit type
            </label>
            <select
              id="visit-type"
              value={visitType}
              onChange={(e) => {
                setVisitType(e.target.value);
                setPage(1);
              }}
              className={`${FIELD} sm:w-44`}
            >
              <option value="">Any type</option>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
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
            <p className="text-sm font-medium text-red-800">The visits didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} visits${narrowed ? ' match' : ''}.` : ''}
        </p>

        {/* List */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Date</span>
            <span>Patient</span>
            <span>Doctor</span>
            <span>Diagnosis</span>
            <span>Status</span>
            <span className="sr-only">Open</span>
          </div>

          {!loaded ? (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="h-8 w-20 rounded bg-gray-100" />
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3.5 w-40 rounded bg-gray-100" />
                    <span className="block h-3 w-24 rounded bg-gray-50" />
                  </span>
                  <span className="hidden h-3.5 w-48 rounded bg-gray-50 lg:block" />
                  <span className="h-5 w-16 rounded bg-gray-100" />
                </li>
              ))}
            </ul>
          ) : visits.length === 0 ? (
            <Empty narrowed={narrowed} mine={mine} canWrite={canWrite} onClear={clearAll} onWholeClinic={() => (setMine(false), setPage(1))} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {visits.map((v, i) => (
                <VisitRow key={v._id} visit={v} index={i} query={debounced} onOpen={() => router.push(`/visits/${v._id}`)} />
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
                {narrowed ? ' matching visits' : mine ? ' of your visits' : ' visits'}
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

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-brand-teal-light px-0.5 text-brand-teal-deep">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function VisitRow({ visit: v, index, query, onOpen }: { visit: Visit; index: number; query: string; onOpen: () => void }) {
  const name = v.patient ? `${v.patient.firstName} ${v.patient.lastName}` : 'Patient record unavailable';
  const primary = v.diagnoses.find((d) => d.primary) ?? v.diagnoses[0];
  const more = Math.max(0, v.diagnoses.length - 1);
  const cancelled = v.status === 'cancelled';

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
        <span className="block font-mono text-sm font-medium tabular-nums text-gray-900">{dayFmt(v.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        <span className="block font-mono text-xs tabular-nums text-gray-500">{timeFmt(v.date)}</span>
      </span>

      <span className="min-w-0">
        <Link href={`/visits/${v._id}`} className={`block truncate rounded font-semibold hover:text-brand-teal-deep ${cancelled ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'} ${FOCUS_RING}`}>
          <Highlight text={name} query={query} />
        </Link>
        <span className="mt-0.5 block truncate text-sm text-gray-500">
          <span className="font-mono text-xs">
            <Highlight text={v.visitCode} query={query} />
          </span>
          {' · '}
          {typeLabel(v.visitType)}
          {v.patient?.patientCode && (
            <>
              {' · '}
              <span className="font-mono text-xs">
                <Highlight text={v.patient.patientCode} query={query} />
              </span>
            </>
          )}
        </span>
      </span>

      <span className="truncate text-sm text-gray-700">{v.provider?.name ?? <span className="text-gray-400">Not recorded</span>}</span>

      <span className="min-w-0 text-sm">
        {primary ? (
          <span className="block truncate">
            {primary.code && <span className="mr-1.5 font-mono text-xs font-semibold text-gray-900">{primary.code}</span>}
            <span className="text-gray-700">{primary.description}</span>
            {more > 0 && <span className="text-gray-500"> +{more} more</span>}
          </span>
        ) : v.chiefComplaint ? (
          <span className="block truncate text-gray-500">{v.chiefComplaint}</span>
        ) : (
          <span className="text-gray-400">No diagnosis yet</span>
        )}
      </span>

      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_BADGE[v.status] ?? STATUS_BADGE.open}`}>{VISIT_STATE[v.status]?.label ?? v.status}</span>
        {v.digitalSignature && (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-600" title={`Signed by ${v.digitalSignature.providerName}`}>
            <Svg d={ICONS.pen} className="h-3 w-3" />
            Signed
          </span>
        )}
      </span>

      <span className="hidden justify-end text-gray-400 transition-colors group-hover:text-gray-700 lg:flex" aria-hidden="true">
        <Svg d={ICONS.chevR} />
      </span>
    </li>
  );
}

function ReadyPanel({ entries, forDoctor }: { entries: ReadyEntry[]; forDoctor: boolean }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="ready-title">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <h2 id="ready-title" className="text-base font-bold tracking-tight text-gray-900">
            {forDoctor ? 'With you now' : 'With a doctor now'} <span className="font-mono font-normal text-gray-500">{entries.length}</span>
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">Called in from the queue. Starting the visit brings in their vital signs.</p>
        </div>
        <Link href="/queue" className={`shrink-0 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
          Queue
          <Svg d={ICONS.arrow} />
        </Link>
      </div>
      <ul className="divide-y divide-gray-100">
        {entries.map((e, i) => {
          const name = e.patient ? `${e.patient.firstName} ${e.patient.lastName}` : e.patientName;
          const vitals = vitalsSummary(e.vitals);
          return (
            <li key={e._id} className="motion-row-in flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3" style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
              <span className="rounded-md bg-brand-teal-dark px-2 py-1 font-mono text-sm font-semibold text-white" title={e.queueNumber}>
                {e.queueNumber.replace(/^([A-Z]+)\d{8}-(\d+)$/, '$1-$2')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-gray-900">{name}</span>
                <span className="block truncate text-sm text-gray-500">
                  {!forDoctor && e.doctor ? `Dr. ${e.doctor.firstName} ${e.doctor.lastName} · ` : ''}
                  {vitals ? <span className="font-mono text-xs">{vitals}</span> : 'No vital signs recorded'}
                </span>
              </span>
              {e.patient && (
                <Link
                  href={`/visits/new?patientId=${e.patient._id}&queueId=${e._id}`}
                  className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
                >
                  <Svg d={ICONS.doc} />
                  Start visit
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function VisitInsights({
  data,
  mine,
  status,
  diagnosis,
  onStatus,
  onDiagnosis,
}: {
  data: Insights;
  mine: boolean;
  status: VisitStatus | '';
  diagnosis: string | null;
  onStatus: (s: VisitStatus) => void;
  onDiagnosis: (d: { code: string; description: string }) => void;
}) {
  const tip = useTooltip();
  const totalVisits = data.days.reduce((s, d) => s + d.visits, 0);
  const dayMax = Math.max(1, ...data.days.map((d) => d.visits));
  const statusTotal = STATUS_ORDER.reduce((s, k) => s + (data.status[k] || 0), 0);
  const unfinished = (data.status.draft || 0) + (data.status.open || 0);
  const dxMax = Math.max(1, ...data.diagnoses.map((d) => d.count));
  const busiest = data.days.reduce((b, d) => (d.visits > b.visits ? d : b), data.days[0]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-[1fr_1.25fr_1.25fr]">
        {/* Notes by status */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="vi-status">
          <h2 id="vi-status" className="text-sm text-gray-600">
            {mine ? 'Your notes' : 'Notes'} still to finish
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${unfinished > 0 ? 'text-gray-900' : 'text-gray-500'}`}>{unfinished.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">draft or open, of {statusTotal.toLocaleString('en-US')} visits</p>
          {statusTotal > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {STATUS_ORDER.filter((k) => (data.status[k] || 0) > 0).map((k, i) => (
                  <span
                    key={k}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${VISIT_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                    style={{ flexGrow: data.status[k], flexBasis: 0, background: VISIT_STATE[k].fill ?? '#F3F4F6', opacity: status && status !== k ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
                {STATUS_ORDER.filter((k) => (data.status[k] || 0) > 0).map((k) => {
                  const on = status === k;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        title={VISIT_STATE[k].hint}
                        onClick={() => onStatus(k)}
                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-center gap-2 text-gray-700">
                          <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 rounded-sm ${VISIT_STATE[k].fill ? '' : 'ring-1 ring-inset ring-gray-400'}`}
                            style={VISIT_STATE[k].fill ? { background: VISIT_STATE[k].fill } : undefined}
                          />
                          <span className={on ? 'font-semibold text-gray-900' : ''}>{VISIT_STATE[k].label}</span>
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

        {/* Visits per day */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="vi-days">
          <h2 id="vi-days" className="text-sm text-gray-600">
            Visits, last 30 days
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{totalVisits.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {busiest && busiest.visits > 0 ? (
              <>
                busiest {dayFmt(busiest.date, { weekday: 'short', month: 'short', day: 'numeric' })} (<span className="font-mono">{busiest.visits}</span>)
              </>
            ) : (
              'none recorded yet'
            )}
          </p>
          <div
            className="mt-4 flex h-20 items-end gap-[2px]"
            role="img"
            aria-label={`Visits per day over the last 30 days, ${totalVisits} in all. Use View as table for each day.`}
          >
            {data.days.map((d, i) => {
              const today = d.date === data.today;
              return (
                <span
                  key={d.date}
                  className="motion-col-grow flex-1 rounded-t-[2px]"
                  style={{
                    height: `${d.visits > 0 ? Math.max(6, (d.visits / dayMax) * 100) : 3}%`,
                    background: d.visits > 0 ? (today ? '#0A7F7E' : SERIES.teal) : '#E5E7EB',
                    animationDelay: `${Math.min(240, i * 8)}ms`,
                  }}
                  onPointerEnter={(e) => tip.showFor(e.currentTarget, <TipRow color={SERIES.teal} kind="bar" label={dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }) + (today ? ' · today' : '')} value={d.visits} />)}
                  onPointerLeave={tip.hide}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-xs text-gray-500">
            <span>{dayFmt(data.days[0].date, { month: 'short', day: 'numeric' })}</span>
            <span className="font-semibold text-gray-900">Today</span>
          </div>
        </section>

        {/* Common diagnoses */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="vi-dx">
          <h2 id="vi-dx" className="text-sm text-gray-600">
            Common diagnoses, last 90 days
          </h2>
          {data.diagnoses.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No coded diagnoses yet. ICD-10 codes added to notes show up here.</p>
          ) : (
            <ul className="mt-3 space-y-1" role="group" aria-label="Filter by diagnosis">
              {data.diagnoses.map((d, i) => {
                const on = diagnosis === d.code;
                return (
                  <li key={d.code}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onDiagnosis({ code: d.code, description: d.description })}
                      aria-label={`${d.code} ${d.description}: ${d.count} visits${on ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="mr-1.5 font-mono text-xs font-semibold text-gray-900">{d.code}</span>
                          <span className={on ? 'font-semibold text-gray-900' : 'text-gray-700'}>{d.description}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{d.count}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span
                          className="motion-bar-grow block h-full rounded-r"
                          style={{ width: `${(d.count / dxMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: diagnosis && !on ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
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
        caption="Visits per day, last 30 days"
        head={['Day', 'Visits']}
        rows={data.days.map((d) => [dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), d.visits])}
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
        <p className="font-semibold text-gray-900">No visits match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by patient code or visit code, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else if (mine) {
    body = (
      <>
        <p className="font-semibold text-gray-900">You haven&apos;t recorded any visits yet</p>
        <p className="mt-1 text-sm text-gray-500">Visits you write appear here. Other doctors&apos; visits are under Whole clinic.</p>
        <button type="button" onClick={onWholeClinic} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Show the whole clinic
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No visits yet</p>
        <p className="mt-1 text-sm text-gray-500">Start one from the queue when a patient is called in, or write one directly.</p>
        {canWrite && (
          <Link href="/visits/new" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            New visit
          </Link>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.doc} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
