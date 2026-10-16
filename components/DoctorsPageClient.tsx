'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { SERIES } from './dashboards/charts';
import WeekBoard, { type Roster } from './doctors/WeekBoard';
import DoctorPerformance from './doctors/Performance';
import { DOCTOR_STATE, doctorName, initials, specialtyOf, statusOf, type DoctorRow } from './doctors/shared';
import { DOCTOR_STATUSES, dayHours, hoursRange, weekSummary, type DoctorStatus } from '@/lib/doctors';
import type { DoctorPermissions } from '@/lib/doctors-page';

type View = 'list' | 'week' | 'performance';

const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_6.5rem_3.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  people: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
};

function Mark({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-brand-teal-light px-0.5 text-inherit">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export default function DoctorsPageClient({ permissions, initialView }: { permissions: DoctorPermissions; initialView: View }) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DoctorStatus | ''>('');
  const [specialty, setSpecialty] = useState('');
  const [week, setWeek] = useState<string | null>(null);

  const list = useKeyedFetch<DoctorRow[]>('/api/doctors');
  const current = useKeyedFetch<Roster>('/api/doctors/roster');
  const other = useKeyedFetch<Roster>(week ? `/api/doctors/roster?week=${week}` : null);
  const weekRoster = week ? (other.value ?? current.value) : current.value;
  const weekDimmed = week ? other.loading || other.valueUrl !== `/api/doctors/roster?week=${week}` : current.loading && current.value !== null;

  const doctors = useMemo(() => list.value ?? [], [list.value]);
  const loaded = list.value !== null;
  const q = search.trim().toLowerCase();
  const rows = doctors
    .filter((d) => {
      if (status && statusOf(d) !== status) return false;
      if (specialty && specialtyOf(d) !== specialty) return false;
      if (!q) return true;
      return [doctorName(d), specialtyOf(d), d.email, d.licenseNumber, d.department ?? ''].some((v) => v.toLowerCase().includes(q));
    })
    .sort((a, b) => DOCTOR_STATUSES.indexOf(statusOf(a)) - DOCTOR_STATUSES.indexOf(statusOf(b)) || a.lastName.localeCompare(b.lastName));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (status) chips.push({ key: 'status', label: DOCTOR_STATE[status].label, clear: () => setStatus('') });
  if (specialty) chips.push({ key: 'spec', label: specialty, clear: () => setSpecialty('') });
  const narrowed = chips.length > 0 || q !== '';
  const clearAll = () => {
    setStatus('');
    setSpecialty('');
    setSearch('');
  };
  const specialties = [...new Set(doctors.map(specialtyOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const views: { key: View; label: string }[] = [
    { key: 'list', label: 'Doctors' },
    { key: 'week', label: 'Week' },
    ...(permissions.canSeePerformance ? [{ key: 'performance' as const, label: 'Workload' }] : []),
  ];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % views.length : e.key === 'ArrowLeft' ? (i - 1 + views.length) % views.length : e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    choose(views[next].key);
    tabRefs.current[next]?.focus();
  };
  function choose(v: View) {
    setView(v);
    window.history.replaceState(null, '', v === 'list' ? '/doctors' : `/doctors?view=${v}`);
  }

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Doctors</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Who practises here, when they’re in, and how to reach them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {permissions.myDoctorId && (
              <Link href={`/doctors/${permissions.myDoctorId}`} className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
                <Svg d={ICONS.user} />
                Your profile and hours
              </Link>
            )}
            {permissions.canAdd && !permissions.myDoctorId && (
              <Link href="/doctors/new?self=1" className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
                <Svg d={ICONS.user} />
                Add yourself as a doctor
              </Link>
            )}
            {permissions.canAdd && (
              <Link href="/doctors/new" className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                <Svg d={ICONS.plus} />
                Add doctor
              </Link>
            )}
          </div>
        </header>

        {loaded ? (
          <DoctorInsights
            doctors={doctors}
            roster={current.value}
            rosterError={current.error}
            onRetryRoster={current.reload}
            status={status}
            specialty={specialty}
            onStatus={(s) => {
              setStatus((cur) => (cur === s ? '' : s));
              choose('list');
            }}
            onSpecialty={(s) => {
              setSpecialty((cur) => (cur === s ? '' : s));
              choose('list');
            }}
            onWeek={() => choose('week')}
          />
        ) : !list.error ? (
          <div className="h-[220px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        ) : null}

        <div role="tablist" aria-label="Doctors views" className="flex gap-1 border-b border-gray-200">
          {views.map((v, i) => (
            <button
              key={v.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`doc-tab-${v.key}`}
              aria-selected={view === v.key}
              aria-controls={`doc-panel-${v.key}`}
              tabIndex={view === v.key ? 0 : -1}
              onClick={() => choose(v.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${view === v.key ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            >
              {v.label}
              {v.key === 'list' && loaded && <span className="ml-1.5 font-mono text-xs font-medium text-gray-500">{doctors.length}</span>}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`doc-panel-${view}`} aria-labelledby={`doc-tab-${view}`} className="flex flex-col gap-4">
          {view === 'list' && (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 lg:flex-row">
                  <div role="search" className="relative flex-1">
                    <label htmlFor="doc-search" className="sr-only">
                      Search doctors
                    </label>
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <Svg d={ICONS.search} />
                    </span>
                    <input
                      id="doc-search"
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, specialty, email or licence number"
                      autoComplete="off"
                      className={`${FIELD} pl-9`}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
                    <label htmlFor="doc-status" className="sr-only">
                      Status
                    </label>
                    <select id="doc-status" value={status} onChange={(e) => setStatus(e.target.value as DoctorStatus | '')} className={`${FIELD} lg:w-40`}>
                      <option value="">Any status</option>
                      {DOCTOR_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {DOCTOR_STATE[s].label}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="doc-spec" className="sr-only">
                      Specialty
                    </label>
                    <select id="doc-spec" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={`${FIELD} lg:w-56`}>
                      <option value="">Any specialty</option>
                      {specialties.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
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
                  <p className="text-sm font-medium text-red-800">The doctors didn&apos;t load ({list.error}).</p>
                  <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
                    <Svg d={ICONS.refresh} />
                    Try again
                  </button>
                </div>
              )}
              <p className="sr-only" aria-live="polite">
                {loaded ? `${rows.length} ${rows.length === 1 ? 'doctor' : 'doctors'}${narrowed ? ' match' : ''}.` : ''}
              </p>

              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
                <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
                  <span>Doctor</span>
                  <span>Usual hours</span>
                  <span>Contact</span>
                  <span>Status</span>
                  <span className="sr-only">Actions</span>
                </div>
                {!loaded ? (
                  list.error ? null : (
                    <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                          <span className="h-9 w-9 rounded-md bg-gray-100" />
                          <span className="flex-1 space-y-1.5">
                            <span className="block h-3.5 w-44 rounded bg-gray-100" />
                            <span className="block h-3 w-28 rounded bg-gray-50" />
                          </span>
                          <span className="hidden h-3 w-40 rounded bg-gray-100 lg:block" />
                          <span className="h-5 w-16 rounded bg-gray-100" />
                        </li>
                      ))}
                    </ul>
                  )
                ) : rows.length === 0 ? (
                  <Empty narrowed={narrowed} canAdd={permissions.canAdd} onClear={clearAll} />
                ) : (
                  <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${list.loading ? 'opacity-60' : ''}`}>
                    {rows.map((d, i) => (
                      <DoctorListRow key={d._id} doctor={d} index={i} query={search} mine={d._id === permissions.myDoctorId} canEdit={permissions.canEdit} onOpen={() => router.push(`/doctors/${d._id}`)} />
                    ))}
                  </ul>
                )}
                {loaded && doctors.length > 0 && (
                  <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                    {narrowed ? (
                      <>
                        <span className="font-mono text-gray-900">{rows.length}</span> of <span className="font-mono">{doctors.length}</span> doctors
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-gray-900">{doctors.length}</span> {doctors.length === 1 ? 'doctor' : 'doctors'}, active first
                      </>
                    )}
                  </p>
                )}
              </div>
            </>
          )}

          {view === 'week' &&
            (weekRoster ? (
              <WeekBoard roster={weekRoster} dimmed={weekDimmed} onWeek={(k) => setWeek(k && current.value?.days.includes(k) ? null : k)} />
            ) : (week ? other.error : current.error) ? (
              <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">The roster didn&apos;t load ({week ? other.error : current.error}).</p>
                <button type="button" onClick={week ? other.reload : current.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
                  <Svg d={ICONS.refresh} />
                  Try again
                </button>
              </div>
            ) : (
              <div className="h-80 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
            ))}

          {view === 'performance' && permissions.canSeePerformance && (current.value ? <DoctorPerformance today={current.value.today} /> : <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />)}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function DoctorListRow({ doctor: d, index, query, mine, canEdit, onOpen }: { doctor: DoctorRow; index: number; query: string; mine: boolean; canEdit: boolean; onOpen: () => void }) {
  const st = statusOf(d);
  const hours = weekSummary(d.schedule);
  const spec = specialtyOf(d);
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID} ${st === 'inactive' ? 'text-gray-500' : ''}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${st === 'inactive' ? 'bg-gray-100 text-gray-500' : 'bg-brand-teal-light text-brand-teal-deep'}`}>
          {initials(d)}
        </span>
        <span className="min-w-0">
          <Link href={`/doctors/${d._id}`} className={`block truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
            <Mark text={doctorName(d)} query={query} />
            {mine && <span className="ml-1.5 text-xs font-medium text-gray-500">(you)</span>}
          </Link>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {spec ? <Mark text={spec} query={query} /> : 'No specialty set'}
            {d.department && d.department !== 'No Department' && ` · ${d.department}`}
            {d.licenseNumber && (
              <span className="font-mono">
                {' · PRC '}
                <Mark text={d.licenseNumber} query={query} />
              </span>
            )}
          </span>
        </span>
      </span>

      <span className="min-w-0 text-sm">
        {st === 'inactive' ? (
          <span className="text-gray-400">Not on the roster</span>
        ) : hours ? (
          <span className="block font-mono text-xs tabular-nums text-gray-900 lg:text-sm">{hours}</span>
        ) : (
          <span className="text-gray-500">No usual hours set</span>
        )}
      </span>

      <span className="min-w-0 text-sm">
        <a href={`mailto:${d.email}`} className={`block truncate rounded text-gray-700 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
          <Mark text={d.email} query={query} />
        </a>
        {d.phone && (
          <a href={`tel:${d.phone.replace(/[^+0-9]/g, '')}`} className={`block w-fit rounded font-mono text-xs text-gray-500 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
            {d.phone}
          </a>
        )}
      </span>

      <span>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${DOCTOR_STATE[st].badge}`}>{DOCTOR_STATE[st].label}</span>
      </span>

      <span className="flex items-center justify-end gap-0.5">
        {canEdit && (
          <Link
            href={`/doctors/${d._id}/edit`}
            aria-label={`Edit ${doctorName(d)}’s profile`}
            title="Edit profile"
            className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:opacity-60 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS_RING}`}
          >
            <Svg d={ICONS.edit} />
          </Link>
        )}
        <span className="hidden text-gray-400 transition-colors group-hover:text-gray-700 lg:inline" aria-hidden="true">
          <Svg d={ICONS.chevR} />
        </span>
      </span>
    </li>
  );
}

/**
 * The three questions the front desk and the clinic owner ask of this page: who is in today
 * (and how booked), what state the roster is in, and which specialties the clinic covers.
 * Status and specialty filter the list; the counts stay clinic-wide.
 */
function DoctorInsights({
  doctors,
  roster,
  rosterError,
  onRetryRoster,
  status,
  specialty,
  onStatus,
  onSpecialty,
  onWeek,
}: {
  doctors: DoctorRow[];
  roster: Roster | null;
  rosterError: string | null;
  onRetryRoster: () => void;
  status: DoctorStatus | '';
  specialty: string;
  onStatus: (s: DoctorStatus) => void;
  onSpecialty: (s: string) => void;
  onWeek: () => void;
}) {
  const counts = DOCTOR_STATUSES.map((s) => ({ s, n: doctors.filter((d) => statusOf(d) === s).length })).filter((c) => c.n > 0);
  const total = doctors.length;

  const specCounts = Object.entries(
    doctors
      .filter((d) => statusOf(d) !== 'inactive')
      .reduce<Record<string, number>>((acc, d) => {
        const s = specialtyOf(d) || 'No specialty set';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {})
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shownSpecs = specCounts.slice(0, 5);
  const specMax = Math.max(1, ...specCounts.map(([, n]) => n));

  const today = roster?.today;
  const inToday = roster && today
    ? roster.doctors
        .map((d) => ({ d, h: dayHours(d, today), booked: roster.bookings?.[d._id]?.[today]?.booked ?? null }))
        .filter((x) => x.h.kind === 'working')
        .sort((a, b) => (a.h.kind === 'working' && b.h.kind === 'working' ? a.h.start.localeCompare(b.h.start) : 0))
    : [];
  const awayToday = roster && today ? roster.doctors.filter((d) => {
    const h = dayHours(d, today);
    return h.kind === 'off' && h.timeOff;
  }).length : 0;

  let todayBody: ReactNode;
  if (!roster) {
    todayBody = rosterError ? (
      <p className="mt-2 text-sm text-gray-600">
        Today’s roster didn&apos;t load.{' '}
        <button type="button" onClick={onRetryRoster} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
          Try again
        </button>
      </p>
    ) : (
      <div className="mt-3 h-24 animate-pulse rounded bg-gray-50" aria-hidden="true" />
    );
  } else {
    todayBody = (
      <>
        <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${inToday.length ? 'text-gray-900' : 'text-gray-500'}`}>{inToday.length}</p>
        <p className="mt-1 text-sm text-gray-500">
          {inToday.length === 0 ? 'No doctor has hours today.' : `${inToday.length === 1 ? 'doctor' : 'doctors'} working today`}
          {awayToday > 0 && `, ${awayToday} on time off`}
        </p>
        {inToday.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {inToday.slice(0, 5).map(({ d, h, booked }) => (
              <li key={d._id}>
                <Link href={`/doctors/${d._id}`} className={`-mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50 ${FOCUS_RING}`}>
                  <span className="min-w-0 truncate text-gray-700">{doctorName(d)}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">
                    {h.kind === 'working' && hoursRange(h.start, h.end)}
                    {booked !== null && <span className="ml-2 text-gray-900">{booked} booked</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onWeek} className={`mt-3 rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
          {inToday.length > 5 ? `See all ${inToday.length} on the week` : 'See the week'} →
        </button>
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="doc-today-h">
          <h2 id="doc-today-h" className="text-sm text-gray-600">
            In today
          </h2>
          {todayBody}
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="doc-status-h">
          <h2 id="doc-status-h" className="text-sm text-gray-600">
            On the roster
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{(total - (counts.find((c) => c.s === 'inactive')?.n ?? 0)).toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {total === 0 ? 'No doctors yet.' : `of ${total} ${total === 1 ? 'profile' : 'profiles'}; inactive doctors can’t be booked`}
          </p>
          {total > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {counts.map(({ s, n }, i) => (
                  <span
                    key={s}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${DOCTOR_STATE[s].fill ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                    style={{ flexGrow: n, flexBasis: 0, background: DOCTOR_STATE[s].fill ?? '#FFFFFF', opacity: status && status !== s ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
                {counts.map(({ s, n }) => {
                  const on = status === s;
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onStatus(s)}
                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-center gap-2 text-gray-700">
                          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${DOCTOR_STATE[s].fill ? '' : 'ring-1 ring-inset ring-gray-400'}`} style={{ background: DOCTOR_STATE[s].fill ?? '#FFFFFF' }} />
                          <span className={on ? 'font-semibold text-gray-900' : ''}>{DOCTOR_STATE[s].label}</span>
                        </span>
                        <span className="font-mono tabular-nums text-gray-900">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="doc-spec-h">
          <h2 id="doc-spec-h" className="text-sm text-gray-600">
            Specialties covered
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${specCounts.length ? 'text-gray-900' : 'text-gray-500'}`}>{specCounts.length}</p>
          <p className="mt-1 text-sm text-gray-500">{specCounts.length === 0 ? 'No active doctors yet.' : 'among active and on-leave doctors'}</p>
          {shownSpecs.length > 0 && (
            <ul className="mt-3 space-y-1" role="group" aria-label="Filter by specialty">
              {shownSpecs.map(([name, n], i) => {
                const on = specialty === name;
                const real = name !== 'No specialty set';
                return (
                  <li key={name}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={!real}
                      onClick={() => onSpecialty(name)}
                      aria-label={`${name}: ${n} ${n === 1 ? 'doctor' : 'doctors'}${on ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={`min-w-0 truncate ${on ? 'font-semibold text-gray-900' : real ? 'text-gray-700' : 'text-gray-500'}`}>{name}</span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{n}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span className="motion-bar-grow block h-full rounded-r" style={{ width: `${(n / specMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: specialty && !on ? 0.3 : 1, animationDelay: `${i * 60}ms` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {specCounts.length > shownSpecs.length && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="font-mono">{specCounts.length - shownSpecs.length}</span> more in the Specialty filter.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, canAdd, onClear }: { narrowed: boolean; canAdd: boolean; onClear: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.people} className="h-5 w-5" />
      </div>
      {narrowed ? (
        <>
          <p className="font-semibold text-gray-900">No doctors match</p>
          <p className="mt-1 text-sm text-gray-500">Check the spelling, search by licence number or email, or loosen a filter.</p>
          <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            Clear search and filters
          </button>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">No doctors yet</p>
          <p className="mt-1 text-sm text-gray-500">Add the clinic’s doctors so patients can be booked with them and their notes and prescriptions carry their name.</p>
          {canAdd && (
            <Link href="/doctors/new" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.plus} />
              Add doctor
            </Link>
          )}
        </>
      )}
    </div>
  );
}
