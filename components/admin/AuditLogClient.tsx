'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES, TrendChart } from '../dashboards/charts';
import PatientSearch, { type PatientOption } from '../patients/PatientSearch';
import AuditEntry, { ENTRY_GRID } from './AuditEntry';
import AuditLogArchives from './AuditLogArchives';
import {
  AUDIT_EXPORT_MAX,
  AUDIT_KINDS,
  AUDIT_RESOURCES,
  KIND_LABEL,
  RESOURCE_LABEL,
  SHOW_LABEL,
  type AuditInsights,
  type AuditKind,
  type AuditResource,
  type AuditRow,
  type AuditShow,
} from '@/lib/audit-log';

export interface AuditStart {
  kind: AuditKind | '';
  show: AuditShow | '';
  resource: AuditResource | '';
  user: string;
  patient: PatientOption | null;
  from: string;
  to: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 50;
const ICONS = {
  ...ICON,
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  log: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};
const count = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

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

/** "yyyy-MM-dd" for an instant, in the clinic's zone. */
function dayIn(iso: string | number, tz: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

const shortDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function AuditLogClient({ meId, start, retentionOn }: { meId: string; start: AuditStart; retentionOn: boolean }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<AuditKind | ''>(start.kind);
  const [show, setShow] = useState<AuditShow | ''>(start.show);
  const [resource, setResource] = useState<AuditResource | ''>(start.resource);
  const [user, setUser] = useState(start.user);
  const [patient, setPatient] = useState<PatientOption | null>(start.patient);
  const [record, setRecord] = useState<{ resource: AuditResource; id: string } | null>(null);
  const [from, setFrom] = useState(start.from);
  const [to, setTo] = useState(start.to);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  // PatientSearch keeps its own text; remounting it is how a cleared filter clears the box.
  const [patientBox, setPatientBox] = useState(0);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  const datesBackwards = !!from && !!to && from > to;
  const filter = new URLSearchParams();
  if (kind) filter.set('kind', kind);
  if (show) filter.set('show', show);
  if (record) {
    filter.set('resource', record.resource);
    filter.set('resourceId', record.id);
  } else if (resource) filter.set('resource', resource);
  if (user) filter.set('user', user);
  if (patient) filter.set('patient', patient._id);
  if (from) filter.set('from', from);
  if (to) filter.set('to', to);
  if (debounced.trim()) filter.set('search', debounced.trim());
  const filterQuery = filter.toString();
  const listUrl = datesBackwards ? null : `/api/audit-logs?${filterQuery}${filterQuery ? '&' : ''}page=${page}&limit=${PAGE_SIZE}`;

  const list = useKeyedFetch<AuditRow[]>(listUrl);
  const insights = useKeyedFetch<AuditInsights>('/api/audit-logs/insights');

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const tz = (list.raw?.tz as string | undefined) ?? insights.value?.tz ?? 'Asia/Manila';
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);
  const people = insights.value?.people ?? [];
  // The clinic's today, from the server (or from when the list arrived, before the figures do).
  const today = insights.value?.today ?? (list.receivedAt ? dayIn(list.receivedAt, tz) : '');
  const yesterday = (() => {
    if (!today) return '';
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA');
  })();

  const reset = () => {
    setPage(1);
    setOpenId(null);
  };
  const toggle = <T,>(setter: (v: T) => void, current: T, next: T, empty: T) => {
    setter(current === next ? empty : next);
    reset();
  };

  const personName = (id: string) => (id === meId ? 'You' : people.find((p) => p._id === id)?.name ?? 'Selected person');
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (kind) chips.push({ key: 'kind', label: KIND_LABEL[kind], clear: () => (setKind(''), reset()) });
  if (show) chips.push({ key: 'show', label: SHOW_LABEL[show], clear: () => (setShow(''), reset()) });
  if (user) chips.push({ key: 'user', label: `By ${personName(user)}`, clear: () => (setUser(''), reset()) });
  if (patient) {
    chips.push({
      key: 'patient',
      label: `About ${patient.firstName} ${patient.lastName}`,
      clear: () => {
        setPatient(null);
        setPatientBox((n) => n + 1);
        reset();
      },
    });
  }
  if (record) chips.push({ key: 'record', label: `This record only (${RESOURCE_LABEL[record.resource]})`, clear: () => (setRecord(null), reset()) });
  else if (resource) chips.push({ key: 'resource', label: RESOURCE_LABEL[resource], clear: () => (setResource(''), reset()) });
  if (from || to) {
    const label = from && to ? (from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`) : from ? `From ${shortDay(from)}` : `Up to ${shortDay(to)}`;
    chips.push({ key: 'dates', label, clear: () => (setFrom(''), setTo(''), reset()) });
  }
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setKind('');
    setShow('');
    setResource('');
    setUser('');
    setPatient(null);
    setPatientBox((n) => n + 1);
    setRecord(null);
    setFrom('');
    setTo('');
    setSearch('');
    setDebounced('');
    reset();
  };

  const pickDay = (date: string) => {
    if (from === date && to === date) {
      setFrom('');
      setTo('');
    } else {
      setFrom(date);
      setTo(date);
    }
    reset();
  };

  const entryFilters = {
    onUser: (id: string) => (setUser(id), reset()),
    onPatient: (p: { _id: string; name: string; code: string | null }) => {
      const [firstName, ...rest] = p.name.split(' ');
      setPatient({ _id: p._id, firstName, lastName: rest.join(' '), patientCode: p.code ?? undefined });
      setPatientBox((n) => n + 1);
      reset();
    },
    onRecord: (r: AuditResource, id: string) => (setRecord({ resource: r, id }), reset()),
  };

  // Rows grouped under their clinic day.
  const groups: { day: string; rows: AuditRow[] }[] = [];
  for (const row of rows) {
    const day = dayIn(row.at, tz);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }
  const dayHeading = (day: string) => {
    const long = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    });
    return day === today ? `Today · ${long}` : day === yesterday ? `Yesterday · ${long}` : long;
  };

  const exportHref = `/api/audit-logs/export${filterQuery ? `?${filterQuery}` : ''}`;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Audit log</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Every sign-in, record opened, change, printout and refused access in the clinic, with who did it and when.
          </p>
        </div>
        <a
          href={exportHref}
          download
          aria-disabled={datesBackwards || total === 0 || undefined}
          onClick={(e) => {
            if (datesBackwards || (loaded && total === 0)) e.preventDefault();
          }}
          className={`inline-flex shrink-0 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-gray-300 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.download} />
          {narrowed ? 'Download these entries' : 'Download CSV'}
        </a>
      </header>

      <p className="-mt-3 text-sm text-gray-500">
        {retentionOn
          ? 'Entries stay here for about three months; the weekly “Archive old records” job then moves each finished month into a file, kept for five years (Archived months, below). Downloading is recorded here too.'
          : 'Entries stay here until “Archive old records” is turned on; it then moves months older than about three months into files, kept for five years. Downloading is recorded here too.'}{' '}
        {insights.value?.oldest && (
          <>
            On file since{' '}
            <span className="font-mono text-gray-700">
              {new Date(insights.value.oldest).toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            .{' '}
          </>
        )}
        <Link href="/admin/settings#automations" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
          Clinic settings
        </Link>
      </p>

      {insights.value ? (
        <Insights
          data={insights.value}
          meId={meId}
          kind={kind}
          show={show}
          user={user}
          day={from && from === to ? from : null}
          onDay={pickDay}
          onKind={(k) => toggle(setKind, kind, k, '')}
          onShow={(s) => toggle(setShow, show, s, '')}
          onOpener={(id) => {
            const on = user === id && kind === 'opened' && show === 'patient';
            setUser(on ? '' : id);
            setKind(on ? '' : 'opened');
            setShow(on ? '' : 'patient');
            reset();
          }}
        />
      ) : insights.error ? (
        <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
          The audit log figures didn’t load ({insights.error}).{' '}
          <button type="button" onClick={insights.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Try again
          </button>
        </p>
      ) : (
        <div className="h-[372px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row">
          <form
            role="search"
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              setDebounced(search);
              reset();
            }}
          >
            <label htmlFor="audit-search" className="sr-only">
              Search the audit log
            </label>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Svg d={ICONS.search} />
            </span>
            <input
              id="audit-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search details, emails or addresses"
              autoComplete="off"
              className={`${FIELD} pl-9`}
            />
          </form>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
            <label htmlFor="audit-kind" className="sr-only">
              Kind of entry
            </label>
            <select id="audit-kind" value={kind} onChange={(e) => (setKind(e.target.value as AuditKind | ''), reset())} className={`${FIELD} lg:w-60`}>
              <option value="">Every kind of entry</option>
              {AUDIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label htmlFor="audit-user" className="sr-only">
              Who
            </label>
            <select id="audit-user" value={user} onChange={(e) => (setUser(e.target.value), reset())} className={`${FIELD} lg:w-52`}>
              <option value="">Anyone</option>
              {user && !people.some((p) => p._id === user) && <option value={user}>Selected person</option>}
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p._id === meId ? `You (${p.name})` : p.name}
                  {p.closed ? ' · closed' : ''}
                </option>
              ))}
            </select>
            <label htmlFor="audit-resource" className="sr-only">
              Record type
            </label>
            <select
              id="audit-resource"
              value={record ? record.resource : resource}
              onChange={(e) => {
                setRecord(null);
                setResource(e.target.value as AuditResource | '');
                reset();
              }}
              className={`${FIELD} lg:w-48`}
            >
              <option value="">Any record</option>
              {AUDIT_RESOURCES.map((r) => (
                <option key={r} value={r}>
                  {RESOURCE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] lg:max-w-2xl">
          <PatientSearch
            key={patientBox}
            label="About a patient"
            value={patient}
            onChange={(p) => {
              setPatient(p);
              reset();
            }}
          />
          <div>
            <label htmlFor="audit-from" className="mb-1.5 block text-sm font-medium text-gray-700">
              From
            </label>
            <input
              id="audit-from"
              type="date"
              value={from}
              max={today || undefined}
              onChange={(e) => (setFrom(e.target.value), reset())}
              aria-invalid={datesBackwards || undefined}
              aria-describedby={datesBackwards ? 'audit-dates-error' : undefined}
              className={`${FIELD} font-mono tabular-nums ${datesBackwards ? 'border-red-400' : ''}`}
            />
          </div>
          <div>
            <label htmlFor="audit-to" className="mb-1.5 block text-sm font-medium text-gray-700">
              To
            </label>
            <input
              id="audit-to"
              type="date"
              value={to}
              max={today || undefined}
              onChange={(e) => (setTo(e.target.value), reset())}
              aria-invalid={datesBackwards || undefined}
              aria-describedby={datesBackwards ? 'audit-dates-error' : undefined}
              className={`${FIELD} font-mono tabular-nums ${datesBackwards ? 'border-red-400' : ''}`}
            />
          </div>
        </div>
        {datesBackwards && (
          <p id="audit-dates-error" className="-mt-1 flex items-center gap-1.5 text-sm text-red-700">
            <Svg d={ICONS.alert} />
            The “From” date is after the “To” date.
          </p>
        )}
        {patient && (
          <p className="-mt-1 text-sm text-gray-500">
            Everything recorded about this patient: who opened, printed or changed their records. Use it to answer a patient who asks who has seen their data.
          </p>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-sm font-medium text-red-800">The entries didn’t load ({list.error}).</p>
          <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.refresh} />
            Try again
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {loaded && !list.loading ? `${plural(total, 'entry', 'entries')}${narrowed ? ' match' : ''}.` : ''}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
        <div className={`hidden ${ENTRY_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
          <span>Time</span>
          <span>Who</span>
          <span>What</span>
          <span>From</span>
          <span className="sr-only">Actions</span>
        </div>

        {!loaded ? (
          list.error || datesBackwards ? null : (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="h-3.5 w-16 rounded bg-gray-100" />
                  <span className="h-3.5 w-32 rounded bg-gray-100" />
                  <span className="h-3.5 flex-1 rounded bg-gray-50" />
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <Empty narrowed={narrowed} onClear={clearAll} />
        ) : (
          <div key={listUrl ?? ''} className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {groups.map((g, gi) => (
              <Fragment key={g.day}>
                <h2 className={`bg-gray-50/60 px-4 py-2 text-sm font-medium text-gray-600 ${gi > 0 ? 'border-t border-gray-200' : ''} border-b border-gray-100`}>
                  {dayHeading(g.day)}
                </h2>
                <ul className="divide-y divide-gray-100">
                  {g.rows.map((row, i) => (
                    <AuditEntry
                      key={row._id}
                      row={row}
                      meId={meId}
                      tz={tz}
                      index={i}
                      open={openId === row._id}
                      onToggle={() => setOpenId((cur) => (cur === row._id ? null : row._id))}
                      filters={entryFilters}
                    />
                  ))}
                </ul>
              </Fragment>
            ))}
          </div>
        )}

        {loaded && total > 0 && (
          <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-mono text-gray-900">
                {count(firstRow)}–{count(lastRow)}
              </span>{' '}
              of <span className="font-mono text-gray-900">{count(total)}</span>
              {narrowed ? ' matching entries' : ' entries'}, newest first
              {total > AUDIT_EXPORT_MAX && <span className="text-gray-500">. A download holds the newest {count(AUDIT_EXPORT_MAX)}</span>}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => (setPage((p) => Math.max(1, p - 1)), setOpenId(null))}
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
                      onClick={() => (setPage(n), setOpenId(null))}
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
                  onClick={() => (setPage((p) => Math.min(pages, p + 1)), setOpenId(null))}
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

      <AuditLogArchives />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insights: the last 30 days, what was done, and who opened patients' records
// ---------------------------------------------------------------------------

function Insights({
  data,
  meId,
  kind,
  show,
  user,
  day,
  onDay,
  onKind,
  onShow,
  onOpener,
}: {
  data: AuditInsights;
  meId: string;
  kind: AuditKind | '';
  show: AuditShow | '';
  user: string;
  day: string | null;
  onDay: (date: string) => void;
  onKind: (k: AuditKind) => void;
  onShow: (s: AuditShow) => void;
  onOpener: (id: string) => void;
}) {
  const kinds = AUDIT_KINDS.filter((k) => data.byKind[k] > 0).sort((a, b) => data.byKind[b] - data.byKind[a]);
  const kindMax = Math.max(1, ...kinds.map((k) => data.byKind[k]));
  const openMax = Math.max(1, ...data.openedBy.map((o) => o.patients));
  const pickedDay = day && data.perDay.some((d) => d.date === day) ? day : null;

  const showButton = (s: AuditShow, n: number, tone?: string) => {
    const active = show === s;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onShow(s)}
        className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
          active ? 'bg-brand-teal-light/60 font-semibold' : ''
        }`}
      >
        <span className={n > 0 && tone ? tone : 'text-gray-700'}>{SHOW_LABEL[s]}</span>
        <span className="shrink-0 font-mono tabular-nums text-gray-900">{count(n)}</span>
      </button>
    );
  };

  const bar = (share: number, active: boolean, dimmed: boolean, i: number) => (
    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
      <span
        className="motion-bar-grow block h-full rounded-r"
        style={{ width: `${share * 100}%`, background: active ? '#0A7F7E' : SERIES.teal, opacity: dimmed ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
      />
    </span>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 border-r border-b border-gray-200 pb-2" aria-labelledby="audit-days-h">
          <div className="px-5 pt-5">
            <h2 id="audit-days-h" className="text-sm text-gray-600">
              Recorded in the last {data.days} days
            </h2>
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{count(data.total)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {pickedDay ? (
                <>
                  Showing <span className="font-medium text-gray-900">{shortDay(pickedDay)}</span> below.{' '}
                  <button type="button" onClick={() => onDay(pickedDay)} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    Show every day
                  </button>
                </>
              ) : (
                'Pick a day to list only its entries.'
              )}
            </p>
          </div>
          <TrendChart
            days={data.perDay}
            today={data.today}
            series={[
              { key: 'entries', label: 'Entries', color: SERIES.teal, kind: 'column' },
              { key: 'refused', label: 'Refused access', color: SERIES.blue, kind: 'line' },
            ]}
            format={count}
            caption={`Audit entries and refused access per day, last ${data.days} days`}
            selected={pickedDay}
            onSelect={onDay}
          />
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="audit-kinds-h">
          <h2 id="audit-kinds-h" className="text-sm text-gray-600">
            What was done
          </h2>
          {kinds.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nothing recorded in the last {data.days} days.</p>
          ) : (
            <ul className="mt-2 space-y-1" role="group" aria-label="Filter by kind of entry">
              {kinds.map((k, i) => {
                const active = kind === k;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onKind(k)}
                      aria-label={`${KIND_LABEL[k]}: ${plural(data.byKind[k], 'entry', 'entries')}${active ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${active ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={`min-w-0 truncate ${active ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{KIND_LABEL[k]}</span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{count(data.byKind[k])}</span>
                      </span>
                      {bar(data.byKind[k] / kindMax, active, !!kind && !active, i)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 space-y-0.5 border-t border-gray-100 pt-3" role="group" aria-label="Filter by outcome">
            {showButton('refused', data.refused, 'text-amber-800')}
            {showButton('failed-sign-in', data.failedSignIns, 'text-amber-800')}
            {showButton('failed', data.failed)}
          </div>
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="audit-patients-h">
          <h2 id="audit-patients-h" className="text-sm text-gray-600">
            Patients whose records were opened
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{count(data.patientsOpened)}</p>
          <p className="mt-1 text-sm text-gray-500">by {plural(data.openers, 'person', 'people')} in the last {data.days} days</p>
          {data.openedBy.length > 0 && (
            <>
              <h3 className="mt-4 text-sm text-gray-600">Opened the most</h3>
              <ul className="mt-1 space-y-1" role="group" aria-label="Filter by who opened patients’ records">
                {data.openedBy.map((o, i) => {
                  const active = user === o._id && kind === 'opened' && show === 'patient';
                  const name = o._id === meId ? 'You' : o.name;
                  return (
                    <li key={o._id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onOpener(o._id)}
                        aria-label={`${name}: opened ${plural(o.patients, 'patient’s record', 'patients’ records')}${active ? ', filtering' : ''}`}
                        className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${active ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className={`min-w-0 truncate ${active ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{name}</span>
                          <span className="shrink-0 font-mono tabular-nums text-gray-900">{count(o.patients)}</span>
                        </span>
                        {bar(o.patients / openMax, active, !!user && !active, i)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="mt-4 border-t border-gray-100 pt-3" role="group" aria-label="Filter to entries about a patient">
            {showButton('patient', data.aboutPatients)}
          </div>
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, onClear }: { narrowed: boolean; onClear: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No entries match</p>
        <p className="mt-1 text-sm text-gray-500">Widen the dates, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">Nothing recorded yet</p>
        <p className="mt-1 text-sm text-gray-500">Sign-ins, records opened and changes will be listed here as staff use the clinic.</p>
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.log} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
