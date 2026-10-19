'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { SERIES, TableTwin, TipRow, useTooltip } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import type { DoctorOption } from './appointments/BookingModal';
import AddToQueueModal from './queue/AddToQueueModal';
import CheckInQrModal from './queue/CheckInQrModal';
import VitalsModal, { hasVitals, vitalsSummary, type Vitals } from './queue/VitalsModal';
import type { QueuePermissions } from '@/lib/queue-page';
import { QUEUE_PRIORITY } from '@/lib/queue-order';

type QueueStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';

interface QueueEntry {
  _id: string;
  queueNumber: string;
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  patientName: string;
  doctor?: { _id: string; firstName: string; lastName: string } | null;
  room?: { _id: string; name?: string; roomNumber?: string } | null;
  appointment?: string | null;
  status: QueueStatus;
  priority?: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  checkedIn: boolean;
  position?: number;
  estimatedWaitTime?: number;
  vitals?: Vitals;
  notes?: string;
}

const POLL_MS = 30_000;
/** Waits past these read amber, then red with a "Long wait" label (colour never alone). */
const WAIT_WARN = 30;
const WAIT_ALERT = 60;
const MAX_LINES = 8;

const ROW_GRID =
  'lg:grid lg:grid-cols-[5.5rem_minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_auto] lg:items-center lg:gap-4';

const ICON_BTN = 'rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep disabled:opacity-40';
/** Destructive icon: neutral at rest, red text on a red tint only while hovered. */
const ICON_BTN_DANGER = 'rounded-md p-2 text-gray-500 transition-colors hover:text-red-700 hover:bg-red-50 disabled:opacity-40';

const TYPE_LABEL: Record<QueueEntry['queueType'], string> = { appointment: 'Appointment', 'walk-in': 'Walk-in', 'follow-up': 'Follow-up' };
const OUTCOME: Record<'completed' | 'cancelled' | 'no-show', { label: string; cls: string }> = {
  completed: { label: 'Seen', cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  'no-show': { label: 'No-show', cls: 'bg-red-50 text-red-700 ring-red-200' },
  cancelled: { label: 'Removed', cls: 'bg-white text-gray-600 ring-gray-300' },
};

const ICONS = {
  ...ICON,
  heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  flag: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z',
  plus: 'M12 4v16m8-8H4',
  login: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1',
  play: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "W20261016-003" → "W-003"; the full number stays available as a title. */
function shortNumber(n: string) {
  const m = /^([A-Z]+)\d{8}-(\d+)$/.exec(n || '');
  return m ? `${m[1]}-${m[2]}` : n;
}

const nameOf = (q: QueueEntry) => (q.patient ? `${q.patient.firstName} ${q.patient.lastName}`.trim() : q.patientName || 'Unknown patient');
const doctorOf = (q: QueueEntry) => (q.doctor ? `Dr. ${q.doctor.firstName} ${q.doctor.lastName}` : null);
const roomOf = (q: QueueEntry) => q.room?.name || q.room?.roomNumber || null;
const lineKey = (q: QueueEntry) => q.doctor?._id ?? 'none';

const minutesBetween = (from?: string, to?: number | string) => (from ? Math.max(0, Math.floor((new Date(to ?? Date.now()).getTime() - new Date(from).getTime()) / 60_000)) : 0);

function duration(min: number) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QueuePageClient({ permissions, doctors }: { permissions: QueuePermissions; doctors: DoctorOption[] }) {
  const router = useRouter();
  const queue = useKeyedFetch<QueueEntry[]>('/api/queue?status=all&limit=500');
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState('');
  const [doctorFilter, setDoctorFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showCheckInQr, setShowCheckInQr] = useState(false);
  const [vitalsFor, setVitalsFor] = useState<QueueEntry | null>(null);
  const [confirm, setConfirm] = useState<{ entry: QueueEntry; status: 'no-show' | 'cancelled' } | null>(null);

  // The queue moves on its own: refresh every 30 s while the tab is visible, and keep wait clocks current.
  const reload = queue.reload;
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === 'visible') reload();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        reload();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const entries = useMemo(() => queue.value ?? [], [queue.value]);
  const loaded = queue.value !== null;

  // --- Clinic-wide figures (they never shrink with a filter) ------------------

  const stats = useMemo(() => {
    const waiting = entries.filter((q) => q.status === 'waiting');
    const withDoctor = entries.filter((q) => q.status === 'in-progress');
    const seen = entries.filter((q) => q.status === 'completed');
    const startedToday = entries.filter((q) => q.startedAt);
    const longest = waiting.reduce<QueueEntry | null>((m, q) => (!m || q.queuedAt < m.queuedAt ? q : m), null);
    return {
      waiting: waiting.length,
      notCheckedIn: waiting.filter((q) => !q.checkedIn).length,
      withDoctor: withDoctor.length,
      seen: seen.length,
      noShows: entries.filter((q) => q.status === 'no-show').length,
      longest,
      longestMin: longest ? minutesBetween(longest.queuedAt, now) : 0,
      medianWait: median(startedToday.map((q) => minutesBetween(q.queuedAt, q.startedAt))),
    };
  }, [entries, now]);

  const lines = useMemo(() => {
    const map = new Map<string, { key: string; label: string; waiting: number; current: QueueEntry | null; oldest: string | null; free: boolean }>();
    const ensure = (key: string, label: string) => {
      if (!map.has(key)) map.set(key, { key, label, waiting: 0, current: null, oldest: null, free: true });
      return map.get(key)!;
    };
    doctors.filter((d) => !d.status || d.status === 'active').forEach((d) => ensure(d._id, `Dr. ${d.firstName} ${d.lastName}`));
    entries.forEach((q) => {
      if (q.status !== 'waiting' && q.status !== 'in-progress') return;
      const line = ensure(lineKey(q), doctorOf(q) ?? 'Any doctor');
      if (q.status === 'in-progress') {
        line.current = q;
        line.free = false;
      } else {
        line.waiting += 1;
        if (!line.oldest || q.queuedAt < line.oldest) line.oldest = q.queuedAt;
      }
    });
    const all = [...map.values()].sort((a, b) => b.waiting - a.waiting || Number(b.free === false) - Number(a.free === false) || a.label.localeCompare(b.label));
    return all.slice(0, MAX_LINES);
  }, [entries, doctors]);

  // --- Filtered list --------------------------------------------------------

  const q = search.trim().toLowerCase();
  const matches = useCallback(
    (e: QueueEntry) =>
      (!doctorFilter || lineKey(e) === doctorFilter) &&
      (!typeFilter || e.queueType === typeFilter) &&
      (!q || nameOf(e).toLowerCase().includes(q) || e.queueNumber.toLowerCase().includes(q) || shortNumber(e.queueNumber).toLowerCase().includes(q) || (e.patient?.patientCode ?? '').toLowerCase().includes(q)),
    [doctorFilter, typeFilter, q]
  );
  const withDoctor = entries.filter((e) => e.status === 'in-progress' && matches(e));
  const waiting = entries.filter((e) => e.status === 'waiting' && matches(e)); // server order: priority, then arrival
  const finished = entries
    .filter((e) => (e.status === 'completed' || e.status === 'no-show' || e.status === 'cancelled') && matches(e))
    .sort((a, b) => (b.completedAt ?? b.startedAt ?? b.queuedAt).localeCompare(a.completedAt ?? a.startedAt ?? a.queuedAt));

  const narrowed = Boolean(doctorFilter || typeFilter || q);
  const doctorLine = lines.find((l) => l.key === doctorFilter) ?? (doctorFilter === 'none' ? { label: 'Any doctor' } : null);
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (doctorFilter) chips.push({ key: 'doctor', label: doctorLine?.label ?? 'Doctor', clear: () => setDoctorFilter(null) });
  if (typeFilter) chips.push({ key: 'type', label: TYPE_LABEL[typeFilter as QueueEntry['queueType']], clear: () => setTypeFilter('') });
  const clearAll = () => {
    setDoctorFilter(null);
    setTypeFilter('');
    setSearch('');
  };

  // --- Actions ----------------------------------------------------------------

  const act = useCallback(
    async (entry: QueueEntry, request: () => Promise<Response>, success: string, fallback: string) => {
      setBusyId(entry._id);
      setActionError(null);
      try {
        const res = await request();
        if (res.status === 401) return router.push('/login');
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(formatApiError(data, fallback));
        setNotice(success);
        reload();
      } catch (err) {
        setNotice(null);
        setActionError(err instanceof Error ? err.message : fallback);
      } finally {
        setBusyId(null);
      }
    },
    [router, reload]
  );

  const put = (entry: QueueEntry, body: Record<string, unknown>) => () =>
    fetch(`/api/queue/${entry._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const actions = {
    checkIn: (e: QueueEntry) =>
      act(
        e,
        () => fetch('/api/queue/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queueId: e._id }) }),
        `${nameOf(e)} is checked in.`,
        'The patient could not be checked in'
      ),
    callIn: (e: QueueEntry) => act(e, put(e, { status: 'in-progress' }), `${nameOf(e)} has been called in${doctorOf(e) ? ` to ${doctorOf(e)}` : ''}.`, 'The patient could not be called in'),
    done: (e: QueueEntry) => act(e, put(e, { status: 'completed' }), `${nameOf(e)} is marked as seen.`, 'The queue entry could not be closed'),
    setPriority: (e: QueueEntry, priority: number) =>
      act(
        e,
        put(e, { priority }),
        priority === QUEUE_PRIORITY.urgent ? `${nameOf(e)} is now urgent and will be called first.` : `${nameOf(e)} is back to normal priority.`,
        'The priority could not be changed'
      ),
    close: (e: QueueEntry, status: 'no-show' | 'cancelled') =>
      act(e, put(e, { status }), status === 'no-show' ? `${nameOf(e)} is marked as a no-show.` : `${nameOf(e)} was removed from the queue.`, 'The queue entry could not be updated'),
  };

  const saveVitals = async (vitals: Vitals) => {
    if (!vitalsFor) return null;
    try {
      const res = await fetch(`/api/queue/${vitalsFor._id}/vitals`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vitals }) });
      if (res.status === 401) {
        router.push('/login');
        return null;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) return formatApiError(data, 'The vital signs could not be saved');
      setNotice(`Vital signs saved for ${nameOf(vitalsFor)}.`);
      setVitalsFor(null);
      reload();
      return null;
    } catch {
      return 'The vital signs could not be saved. Check your connection and try again.';
    }
  };

  const rowProps = { now, busyId, permissions, actions, onVitals: setVitalsFor, onConfirm: (entry: QueueEntry, status: 'no-show' | 'cancelled') => setConfirm({ entry, status }) };
  const refreshing = queue.loading && loaded;

  // --- Render -------------------------------------------------------------------

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Queue</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Who is waiting, who is with a doctor, and who is next.</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-gray-500 sm:block" aria-live="off">
              {queue.receivedAt ? (
                <>
                  Updated <span className="font-mono">{clock(new Date(queue.receivedAt).toISOString())}</span>
                </>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => {
                setNow(Date.now());
                reload();
              }}
              disabled={queue.loading}
              aria-label="Refresh the queue"
              title="Refresh (updates every 30 seconds)"
              className={`rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition-colors hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.refresh} className={`h-4 w-4 ${queue.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowCheckInQr(true)}
              title="Show the QR patients scan in the eMCR app to check in"
              className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
            >
              Check-in QR
            </button>
            {permissions.canAdd && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICONS.plus} />
                Add to queue
              </button>
            )}
          </div>
        </header>

        <p className="sr-only" aria-live="polite">
          {notice ?? ''}
        </p>
        {notice && (
          <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            <p>{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.x} />
            </button>
          </div>
        )}
        {actionError && (
          <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <p>{actionError}</p>
            <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.x} />
            </button>
          </div>
        )}

        {queue.error && !loaded ? (
          <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-red-600">
              <Svg d={ICONS.alert} className="h-5 w-5" />
            </div>
            <p className="font-semibold text-gray-900">The queue didn&apos;t load</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{queue.error}. Check your connection and try again.</p>
            <button type="button" onClick={reload} className={`mt-5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </div>
        ) : !loaded ? (
          <QueueSkeleton />
        ) : (
          <>
            {queue.error && (
              <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                The last refresh failed ({queue.error}). Showing the queue as of {queue.receivedAt ? clock(new Date(queue.receivedAt).toISOString()) : 'earlier'}.
              </p>
            )}

            {/* Right now */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <dl className="grid -mr-px -mb-px grid-cols-2 lg:grid-cols-4">
                <Figure label="Waiting" value={stats.waiting} detail={stats.notCheckedIn > 0 ? `${stats.notCheckedIn} not checked in` : stats.waiting ? 'all checked in' : 'nobody waiting'} />
                <Figure label="With a doctor" value={stats.withDoctor} detail={`${lines.filter((l) => l.free && l.key !== 'none').length} doctors free`} />
                <Figure
                  label="Longest wait"
                  value={stats.longest ? duration(stats.longestMin) : '—'}
                  detail={stats.longest ? `${nameOf(stats.longest)} · since ${clock(stats.longest.queuedAt)}` : 'no one waiting'}
                  tone={stats.longestMin >= WAIT_ALERT ? 'alert' : stats.longestMin >= WAIT_WARN ? 'warn' : undefined}
                />
                <Figure
                  label="Seen today"
                  value={stats.seen}
                  detail={stats.medianWait !== null ? `typical wait ${duration(stats.medianWait)}${stats.noShows ? ` · ${stats.noShows} no-show${stats.noShows === 1 ? '' : 's'}` : ''}` : 'no one seen yet'}
                />
              </dl>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              {/* The line */}
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <label htmlFor="queue-search" className="sr-only">
                        Search the queue
                      </label>
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Svg d={ICONS.search} />
                      </span>
                      <input
                        id="queue-search"
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, queue number or patient code"
                        autoComplete="off"
                        className={`${FIELD} pl-9`}
                      />
                    </div>
                    <label htmlFor="queue-type" className="sr-only">
                      Type
                    </label>
                    <select id="queue-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${FIELD} sm:w-44`}>
                      <option value="">All types</option>
                      <option value="appointment">Appointments</option>
                      <option value="walk-in">Walk-ins</option>
                      <option value="follow-up">Follow-ups</option>
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
                          className={`motion-chip-in inline-flex items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                        >
                          {c.label}
                          <Svg d={ICONS.x} className="h-3.5 w-3.5" />
                        </button>
                      ))}
                      <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                        Clear all
                      </button>
                    </div>
                  )}
                </div>

                <section className={`rounded-lg border border-gray-200 bg-white overflow-hidden transition-opacity duration-200 ${refreshing ? 'opacity-80' : ''}`} aria-busy={queue.loading} aria-label="Queue">
                  <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
                    <span>Number</span>
                    <span>Patient</span>
                    <span>Doctor</span>
                    <span>Wait</span>
                    <span className="sr-only">Actions</span>
                  </div>

                  {withDoctor.length === 0 && waiting.length === 0 ? (
                    <Empty
                      narrowed={narrowed}
                      onClear={clearAll}
                      onAdd={permissions.canAdd ? () => setAdding(true) : undefined}
                      seen={stats.seen}
                    />
                  ) : (
                    <>
                      {withDoctor.length > 0 && (
                        <Group title="With a doctor" count={withDoctor.length}>
                          {withDoctor.map((e, i) => (
                            <Row key={e._id} entry={e} index={i} {...rowProps} />
                          ))}
                        </Group>
                      )}
                      {waiting.length > 0 && (
                        <Group title="Waiting" count={waiting.length} hint="Called in this order: urgent first, then by arrival.">
                          {waiting.map((e, i) => (
                            <Row key={e._id} entry={e} index={i + withDoctor.length} {...rowProps} />
                          ))}
                        </Group>
                      )}
                    </>
                  )}

                  {finished.length > 0 && (
                    <details className="group border-t border-gray-200">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-2">
                          <Svg d={ICONS.chevR} className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                          Finished today
                        </span>
                        <span className="font-mono text-gray-500">{finished.length}</span>
                      </summary>
                      <ul className="divide-y divide-gray-100 border-t border-gray-100">
                        {finished.map((e) => (
                          <FinishedRow key={e._id} entry={e} />
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              </div>

              {/* Doctors: each line is also a filter */}
              <DoctorLines lines={lines} now={now} active={doctorFilter} onPick={(key) => setDoctorFilter((cur) => (cur === key ? null : key))} />
            </div>
          </>
        )}
      </div>

      {adding && (
        <AddToQueueModal
          doctors={doctors}
          onClose={() => setAdding(false)}
          onAdded={(message) => {
            setAdding(false);
            setActionError(null);
            setNotice(message);
            reload();
          }}
        />
      )}
      {showCheckInQr && <CheckInQrModal onClose={() => setShowCheckInQr(false)} />}
      {vitalsFor && (
        <VitalsModal
          patientName={nameOf(vitalsFor)}
          queueLabel={shortNumber(vitalsFor.queueNumber)}
          initial={vitalsFor.vitals}
          onClose={() => setVitalsFor(null)}
          onSave={saveVitals}
        />
      )}
      {confirm &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(open) => !open && setConfirm(null)}
            title={confirm.status === 'no-show' ? 'Mark as a no-show?' : 'Remove from the queue?'}
            description={
              confirm.status === 'no-show'
                ? `${nameOf(confirm.entry)} (${shortNumber(confirm.entry.queueNumber)}) didn't answer when called. Their appointment, if any, is marked as a no-show too.`
                : `${nameOf(confirm.entry)} (${shortNumber(confirm.entry.queueNumber)}) leaves the queue. Their appointment, if any, is cancelled.`
            }
          >
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
            >
              Keep in queue
            </button>
            <button
              type="button"
              onClick={() => {
                actions.close(confirm.entry, confirm.status);
                setConfirm(null);
              }}
              className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}
            >
              {confirm.status === 'no-show' ? 'Mark no-show' : 'Remove'}
            </button>
          </AlertDialog>,
          document.body
        )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Figure({ label, value, detail, tone }: { label: string; value: ReactNode; detail: ReactNode; tone?: 'warn' | 'alert' }) {
  return (
    <div className="border-r border-b border-gray-200 px-5 py-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${tone === 'alert' ? 'text-red-700' : tone === 'warn' ? 'text-amber-800' : 'text-gray-900'}`}>
        {value}
        {tone === 'alert' && <span className="ml-2 align-middle font-sans text-xs font-semibold">Long wait</span>}
      </dd>
      <dd className="mt-0.5 truncate text-sm text-gray-500">{detail}</dd>
    </div>
  );
}

function Group({ title, count, hint, children }: { title: string; count: number; hint?: string; children: ReactNode }) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <h2 className="flex items-baseline justify-between gap-3 bg-white px-4 pt-3.5 pb-1.5 text-sm font-semibold text-gray-900">
        <span>
          {title} <span className="font-mono font-normal text-gray-500">{count}</span>
        </span>
        {hint && <span className="hidden text-xs font-normal text-gray-500 sm:inline">{hint}</span>}
      </h2>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </div>
  );
}

type Actions = {
  checkIn: (e: QueueEntry) => void;
  callIn: (e: QueueEntry) => void;
  done: (e: QueueEntry) => void;
  setPriority: (e: QueueEntry, p: number) => void;
};

function Row({
  entry: e,
  index,
  now,
  busyId,
  permissions,
  actions,
  onVitals,
  onConfirm,
}: {
  entry: QueueEntry;
  index: number;
  now: number;
  busyId: string | null;
  permissions: QueuePermissions;
  actions: Actions;
  onVitals: (e: QueueEntry) => void;
  onConfirm: (e: QueueEntry, status: 'no-show' | 'cancelled') => void;
}) {
  const inRoom = e.status === 'in-progress';
  const waitMin = minutesBetween(e.queuedAt, inRoom ? e.startedAt : now);
  const consultMin = inRoom ? minutesBetween(e.startedAt, now) : 0;
  const tone = !inRoom && waitMin >= WAIT_ALERT ? 'alert' : !inRoom && waitMin >= WAIT_WARN ? 'warn' : null;
  const priority = e.priority ?? 0;
  const busy = busyId === e._id;
  const name = nameOf(e);
  const vitals = vitalsSummary(e.vitals);
  const doctor = doctorOf(e);
  const room = roomOf(e);

  // Next step as one labelled button, the rest as quiet icons.
  let primary: ReactNode = null;
  const btn = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep disabled:cursor-wait disabled:opacity-50 ${FOCUS_RING}`;
  if (permissions.canUpdate && e.status === 'waiting' && !e.checkedIn) {
    primary = (
      <button type="button" disabled={busy} onClick={() => actions.checkIn(e)} aria-label={`Check in ${name}`} className={btn}>
        <Svg d={ICONS.login} />
        {busy ? 'Saving…' : 'Check in'}
      </button>
    );
  } else if (permissions.canUpdate && e.status === 'waiting') {
    primary = (
      <button type="button" disabled={busy} onClick={() => actions.callIn(e)} aria-label={`Call in ${name}`} className={btn}>
        <Svg d={ICONS.play} />
        {busy ? 'Saving…' : 'Call in'}
      </button>
    );
  } else if (inRoom && permissions.canStartVisit && e.patient) {
    primary = (
      <Link href={`/visits/new?patientId=${e.patient._id}&queueId=${e._id}`} aria-label={`Start the visit for ${name}`} className={btn}>
        <Svg d={ICONS.arrow} />
        Start visit
      </Link>
    );
  } else if (inRoom && permissions.canUpdate) {
    primary = (
      <button type="button" disabled={busy} onClick={() => actions.done(e)} aria-label={`Mark ${name} as seen`} className={btn}>
        <Svg d={ICONS.check} />
        {busy ? 'Saving…' : 'Mark seen'}
      </button>
    );
  }

  const icon = (label: string, d: string, run: () => void, danger = false) => (
    <button
      key={label}
      type="button"
      onClick={run}
      disabled={busy}
      aria-label={`${label}: ${name}`}
      title={label}
      className={`${danger ? ICON_BTN_DANGER : ICON_BTN} ${FOCUS_RING}`}
    >
      <Svg d={d} />
    </button>
  );
  const secondary: ReactNode[] = [];
  if (permissions.canUpdate) {
    secondary.push(icon(hasVitals(e.vitals) ? 'Update vital signs' : 'Record vital signs', ICONS.heart, () => onVitals(e)));
    if (inRoom && permissions.canStartVisit) secondary.push(icon('Mark seen', ICONS.check, () => actions.done(e)));
    if (!inRoom) {
      secondary.push(
        priority >= QUEUE_PRIORITY.urgent
          ? icon('Back to normal priority', ICONS.flag, () => actions.setPriority(e, QUEUE_PRIORITY.normal))
          : icon('Mark urgent', ICONS.flag, () => actions.setPriority(e, QUEUE_PRIORITY.urgent))
      );
      secondary.push(icon('Mark as no-show', ICONS.userX, () => onConfirm(e, 'no-show')));
      secondary.push(icon('Remove from queue', ICONS.x, () => onConfirm(e, 'cancelled'), true));
    }
  }

  return (
    <li
      className={`motion-row-in flex flex-col gap-2 px-4 py-3 transition-colors ${inRoom ? 'bg-brand-teal-light/40' : 'hover:bg-gray-50'} ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      {/* Number + place in line */}
      <span className="flex items-center gap-3 lg:block">
        <span title={e.queueNumber} className={`inline-block rounded-md px-2 py-1 font-mono text-sm font-semibold tabular-nums ${inRoom ? 'bg-brand-teal-dark text-white' : 'bg-gray-100 text-gray-900'}`}>
          {shortNumber(e.queueNumber)}
        </span>
        <span className="text-xs text-gray-500 lg:mt-1 lg:block">{inRoom ? 'In consult' : e.position ? (e.position === 1 ? 'Next in line' : `${ordinal(e.position)} in line`) : ''}</span>
      </span>

      {/* Patient */}
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          {e.patient ? (
            <Link href={`/patients/${e.patient._id}`} className={`truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {name}
            </Link>
          ) : (
            <span className="truncate font-semibold text-gray-900">{name}</span>
          )}
          {priority >= QUEUE_PRIORITY.urgent ? (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">Urgent</span>
          ) : priority === QUEUE_PRIORITY.high ? (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">High priority</span>
          ) : null}
          {!e.checkedIn && !inRoom && (
            <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">Not checked in</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm text-gray-500">
          {TYPE_LABEL[e.queueType]}
          {e.patient?.patientCode && (
            <>
              {' · '}
              <span className="font-mono text-xs">{e.patient.patientCode}</span>
            </>
          )}
          {e.notes && <> · {e.notes}</>}
        </span>
        {vitals && (
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-gray-600">
            <Svg d={ICONS.heart} className="h-3 w-3 shrink-0 text-gray-400" />
            {vitals}
          </span>
        )}
      </span>

      {/* Doctor */}
      <span className="min-w-0 text-sm">
        <span className={`block truncate ${doctor ? 'text-gray-700' : 'text-gray-500'}`}>{doctor ?? 'Next available doctor'}</span>
        {room && <span className="block truncate text-gray-500">{room}</span>}
      </span>

      {/* Wait */}
      <span className="text-sm">
        {inRoom ? (
          <>
            <span className="block font-mono font-medium tabular-nums text-gray-900">{duration(consultMin)}</span>
            <span className="block text-xs text-gray-500">in consult · waited {duration(waitMin)}</span>
          </>
        ) : (
          <>
            <span className={`block font-mono font-medium tabular-nums ${tone === 'alert' ? 'text-red-700' : tone === 'warn' ? 'text-amber-800' : 'text-gray-900'}`}>
              {duration(waitMin)}
              {tone === 'alert' && <span className="ml-1.5 font-sans text-xs font-semibold">Long wait</span>}
            </span>
            <span className="block text-xs text-gray-500">
              since <span className="font-mono">{clock(e.queuedAt)}</span>
              {e.estimatedWaitTime !== undefined && e.position !== undefined && (
                <> · {e.position === 1 && e.estimatedWaitTime === 0 ? 'up next' : `about ${duration(e.estimatedWaitTime)} to go`}</>
              )}
            </span>
          </>
        )}
      </span>

      {/* Actions */}
      <span className="flex items-center justify-end gap-1">
        {primary}
        {secondary}
      </span>
    </li>
  );
}

function FinishedRow({ entry: e }: { entry: QueueEntry }) {
  const outcome = OUTCOME[e.status as keyof typeof OUTCOME];
  const waited = e.startedAt ? minutesBetween(e.queuedAt, e.startedAt) : null;
  const consult = e.startedAt && e.completedAt ? minutesBetween(e.startedAt, e.completedAt) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span title={e.queueNumber} className="w-16 font-mono text-gray-500">
        {shortNumber(e.queueNumber)}
      </span>
      <span className={`min-w-0 flex-1 truncate ${e.status === 'cancelled' ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'}`}>{nameOf(e)}</span>
      <span className="text-gray-500">{doctorOf(e) ?? ''}</span>
      <span className="font-mono text-xs text-gray-500 tabular-nums">
        {waited !== null ? `waited ${duration(waited)}` : `joined ${clock(e.queuedAt)}`}
        {consult !== null ? ` · consult ${duration(consult)}` : ''}
      </span>
      {outcome && <span className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${outcome.cls}`}>{outcome.label}</span>}
    </li>
  );
}

function DoctorLines({
  lines,
  now,
  active,
  onPick,
}: {
  lines: { key: string; label: string; waiting: number; current: QueueEntry | null; oldest: string | null; free: boolean }[];
  now: number;
  active: string | null;
  onPick: (key: string) => void;
}) {
  const tip = useTooltip();
  const max = Math.max(1, ...lines.map((l) => l.waiting));
  if (lines.length === 0) return null;

  return (
    <section className="self-start rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="lines-title">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 id="lines-title" className="text-base font-bold tracking-tight text-gray-900">
          By doctor
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">Waiting per doctor. Pick one to see only their line.</p>
      </div>
      <ul className="px-3 py-2" role="group" aria-label="Filter by doctor">
        {lines.map((l, i) => {
          const on = active === l.key;
          const oldestMin = l.oldest ? minutesBetween(l.oldest, now) : 0;
          const content = (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">{l.label}</p>
              <TipRow color={SERIES.teal} kind="bar" label="Waiting" value={l.waiting} />
              {l.oldest && <TipRow color="#9CA3AF" kind="bar" label="Longest wait" value={duration(oldestMin)} />}
            </div>
          );
          return (
            <li key={l.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(l.key)}
                onPointerEnter={(e) => tip.showFor(e.currentTarget, content)}
                onPointerLeave={tip.hide}
                onFocus={(e) => tip.showFor(e.currentTarget, content)}
                onBlur={tip.hide}
                aria-label={`${l.label}: ${l.waiting} waiting, ${l.current ? `with ${nameOf(l.current)}` : 'free'}${on ? ', filtering' : ''}`}
                className={`w-full rounded-md px-2 py-2.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
              >
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={`truncate ${on ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{l.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-gray-900">{l.waiting}</span>
                </span>
                <span className="mt-1.5 block h-2 rounded-r bg-gray-100" aria-hidden="true">
                  {l.waiting > 0 && (
                    <span
                      className="motion-bar-grow block h-full rounded-r"
                      style={{ width: `${(l.waiting / max) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, animationDelay: `${Math.min(240, i * 40)}ms` }}
                    />
                  )}
                </span>
                <span className="mt-1.5 block truncate text-xs text-gray-500">
                  {l.current ? (
                    <>
                      With <span className="text-gray-700">{nameOf(l.current)}</span>
                    </>
                  ) : l.key === 'none' ? (
                    'Goes to whichever doctor is free'
                  ) : (
                    'Free now'
                  )}
                  {l.oldest && <> · longest {duration(oldestMin)}</>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <TableTwin
        caption="Patients waiting per doctor"
        head={['Doctor', 'Waiting', 'Longest wait', 'Now']}
        numeric={[false, true, true, false]}
        rows={lines.map((l) => [l.label, l.waiting, l.oldest ? duration(minutesBetween(l.oldest, now)) : '—', l.current ? `With ${nameOf(l.current)}` : 'Free'])}
      />
      {tip.node}
    </section>
  );
}

function Empty({ narrowed, onClear, onAdd, seen }: { narrowed: boolean; onClear: () => void; onAdd?: () => void; seen: number }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.queue} className="h-5 w-5" />
      </div>
      {narrowed ? (
        <>
          <p className="font-semibold text-gray-900">No one in the queue matches</p>
          <p className="mt-1 text-sm text-gray-500">Check the name or number, or clear the filters.</p>
          <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            Clear search and filters
          </button>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">Nobody is waiting</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {seen > 0 ? `${seen} seen so far today. ` : ''}Patients join when you add them here, move them in from Appointments, or a walk-in is booked.
          </p>
          {onAdd && (
            <button type="button" onClick={onAdd} className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.plus} />
              Add to queue
            </button>
          )}
        </>
      )}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-hidden="true">
      <div className="h-[98px] rounded-lg border border-gray-200 bg-white" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="h-7 w-14 rounded bg-gray-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 rounded bg-gray-100" />
                <div className="h-3 w-24 rounded bg-gray-50" />
              </div>
              <div className="h-3.5 w-16 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-lg border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
