'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClinicDay, STATE, stateOf, toMinutes, type StateKey, type TodaySchedule } from './dashboards/charts';
import MonthCalendar, { monthOf, type DayLoad } from './appointments/MonthCalendar';
import BookingModal, { type BookingMode, type DoctorOption, type PatientOption } from './appointments/BookingModal';
import {
  AppointmentActions,
  FIELD,
  FOCUS_RING,
  ICON,
  InQueueBadge,
  Svg,
  WalkInBadge,
  dayLabel,
  doctorName,
  endLabel,
  keyToDate,
  localKey,
  patientName,
  relationTo,
  shiftDay,
  specialty,
  timeLabel,
  useAppointmentActions,
  type Appointment,
  type AppointmentPermissions,
} from './appointments/shared';
import { StatusBadge } from './dashboards/shared';
import { useKeyedFetch } from './hooks/useKeyedFetch';

interface Summary {
  month: string;
  today: string;
  now: string;
  defaultDuration: number;
  businessHours: { day: string; open: string | null; close: string | null; closed: boolean }[];
  days: DayLoad[];
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const STATE_ORDER: StateKey[] = ['upcoming', 'pending', 'completed', 'noShow', 'cancelled'];
const ROW_GRID =
  'lg:grid lg:grid-cols-[6.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_auto] lg:items-center lg:gap-4';

function relativeDay(key: string, today: string) {
  const diff = Math.round((keyToDate(key).getTime() - keyToDate(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

export default function AppointmentsPageClient({
  permissions,
  doctors,
  initialDate,
  openBooking = false,
  patientId,
  initialDoctor,
  bookingDoctor,
}: {
  permissions: AppointmentPermissions;
  /** The clinic's doctors, loaded on the server (names only). */
  doctors: DoctorOption[];
  /** Day to open on ("yyyy-MM-dd", from ?date=); today otherwise. */
  initialDate?: string;
  /** Opened at /appointments/new: start with the booking form. */
  openBooking?: boolean;
  /** Prefill the booking form with this patient. */
  patientId?: string;
  /** Show only this doctor's bookings (from ?doctor=, e.g. a doctor's page). */
  initialDoctor?: string;
  /** Prefill the booking form with this doctor (from /appointments/new?doctorId=). */
  bookingDoctor?: string;
}) {
  const router = useRouter();
  const [browserToday] = useState(() => localKey(new Date()));
  const [selected, setSelected] = useState(initialDate ?? browserToday);
  const [month, setMonth] = useState(monthOf(initialDate ?? browserToday));
  const [doctorFilter, setDoctorFilter] = useState(initialDoctor ?? '');
  const [roomFilter, setRoomFilter] = useState('');
  const [stateFilter, setStateFilter] = useState<StateKey | null>(null);
  const [walkInsOnly, setWalkInsOnly] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [booking, setBooking] = useState<{ mode: BookingMode; n: number } | null>(() =>
    openBooking && !patientId ? { mode: 'scheduled', n: 0 } : null
  );
  const [bookingPatient, setBookingPatient] = useState<PatientOption | null>(null);

  // --- Data -----------------------------------------------------------------

  const summary = useKeyedFetch<Summary>(`/api/appointments/summary?${new URLSearchParams({ month, ...(doctorFilter ? { doctorId: doctorFilter } : {}) })}`);
  const dayUrl = `/api/appointments?${new URLSearchParams({ date: selected, limit: '500', ...(doctorFilter ? { doctorId: doctorFilter } : {}) })}`;
  const day = useKeyedFetch<Appointment[]>(dayUrl);
  const queue = useKeyedFetch<{ appointment?: string | { _id: string } | null }[]>(permissions.canSeeQueue ? '/api/queue?status=waiting,in-progress' : null);

  const reloadDay = day.reload;
  const reloadSummary = summary.reload;
  const reloadQueue = queue.reload;
  const refreshAll = useCallback(() => {
    reloadDay();
    reloadSummary();
    reloadQueue();
  }, [reloadDay, reloadSummary, reloadQueue]);

  // Opened from a patient record: load that patient, then open the form for them.
  useEffect(() => {
    if (!openBooking || !patientId) return;
    let cancelled = false;
    fetch(`/api/patients/${patientId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success && json.data) setBookingPatient(json.data);
        setBooking({ mode: 'scheduled', n: 0 });
      })
      .catch(() => !cancelled && setBooking({ mode: 'scheduled', n: 0 }));
    return () => {
      cancelled = true;
    };
  }, [openBooking, patientId]);

  const today = summary.value?.today ?? browserToday;
  const relation = relationTo(selected, today);
  const queuedIds = useMemo(
    () =>
      new Set(
        (queue.value ?? [])
          .map((q) => (typeof q.appointment === 'string' ? q.appointment : q.appointment?._id))
          .filter((id): id is string => Boolean(id))
      ),
    [queue.value]
  );

  const showDay = day.valueUrl === dayUrl;
  const dayItems = useMemo(() => (showDay ? day.value ?? [] : []), [showDay, day.value]);
  const firstLoad = !showDay && !day.error;
  const refreshing = day.loading && showDay;

  const rooms = useMemo(() => [...new Set(dayItems.map((a) => a.room?.trim()).filter((r): r is string => Boolean(r)))].sort(), [dayItems]);
  const mix = useMemo(() => {
    const out: Record<StateKey, number> = { upcoming: 0, completed: 0, pending: 0, noShow: 0, cancelled: 0 };
    dayItems.forEach((a) => (out[stateOf(a.status)] += 1));
    return out;
  }, [dayItems]);
  const walkInCount = dayItems.filter((a) => a.isWalkIn && a.status !== 'cancelled').length;

  const filtered = useMemo(
    () =>
      dayItems
        .filter((a) => !roomFilter || a.room?.trim() === roomFilter)
        .filter((a) => !stateFilter || stateOf(a.status) === stateFilter)
        .filter((a) => !walkInsOnly || a.isWalkIn)
        .sort((a, b) => (toMinutes(a.appointmentTime) ?? 9999) - (toMinutes(b.appointmentTime) ?? 9999)),
    [dayItems, roomFilter, stateFilter, walkInsOnly]
  );

  const weekday = WEEKDAY_NAMES[keyToDate(selected).getDay()];
  const hours = summary.value?.businessHours.find((h) => h.day === weekday);
  const closedWeekdays = useMemo(() => new Set((summary.value?.businessHours ?? []).filter((h) => h.closed).map((h) => h.day)), [summary.value]);
  const doctorLabel = doctors.find((d) => d._id === doctorFilter);

  const schedule: TodaySchedule = useMemo(
    () => ({
      open: hours && !hours.closed ? hours.open : null,
      close: hours && !hours.closed ? hours.close : null,
      closedToday: Boolean(hours?.closed),
      now: relation === 'today' ? summary.value?.now ?? null : null,
      past: relation === 'past',
      appointments: filtered
        .filter((a) => toMinutes(a.appointmentTime) !== null)
        .map((a) => ({
          _id: a._id,
          time: a.appointmentTime as string,
          duration: a.duration || summary.value?.defaultDuration || 30,
          status: a.status,
          patient: patientName(a),
          doctorId: a.doctor?._id ?? null,
          doctor: a.doctor ? doctorName(a) : 'Unassigned',
        })),
    }),
    [hours, relation, summary.value, filtered]
  );
  const untimed = filtered.length - schedule.appointments.length;

  // --- Navigation -------------------------------------------------------------

  const goTo = useCallback((key: string) => {
    setSelected(key);
    setMonth(monthOf(key));
    setStateFilter(null);
    setRoomFilter('');
    setWalkInsOnly(false);
  }, []);

  const clearFilters = () => {
    setDoctorFilter('');
    setRoomFilter('');
    setStateFilter(null);
    setWalkInsOnly(false);
  };

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (doctorLabel) chips.push({ key: 'doctor', label: `Dr. ${doctorLabel.firstName} ${doctorLabel.lastName}`, clear: () => setDoctorFilter('') });
  if (roomFilter) chips.push({ key: 'room', label: `Room: ${roomFilter}`, clear: () => setRoomFilter('') });
  if (stateFilter) chips.push({ key: 'state', label: STATE[stateFilter].label, clear: () => setStateFilter(null) });
  if (walkInsOnly) chips.push({ key: 'walkin', label: 'Walk-ins', clear: () => setWalkInsOnly(false) });
  const narrowed = Boolean(roomFilter || stateFilter || walkInsOnly);

  // --- Actions ----------------------------------------------------------------

  const onDone = useCallback(
    (message: string) => {
      setActionError(null);
      setNotice(message);
      refreshAll();
    },
    [refreshAll]
  );
  const onError = useCallback((message: string) => {
    setNotice(null);
    setActionError(message);
  }, []);
  const actions = useAppointmentActions({ onDone, onError });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const closeBooking = () => {
    setBooking(null);
    setBookingPatient(null);
    if (openBooking) window.history.replaceState(null, '', '/appointments');
  };

  const dayName = dayLabel(selected);
  const booked = dayItems.filter((a) => a.status !== 'cancelled').length;

  // --- Render -------------------------------------------------------------------

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* Title row */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Appointments</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Book, confirm and check in patients, one day at a time.</p>
          </div>
          {permissions.canBook && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBooking((b) => ({ mode: 'walk-in', n: (b?.n ?? 0) + 1 }))}
                className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
              >
                <Svg d={ICON.walk} />
                Add walk-in
              </button>
              <button
                type="button"
                onClick={() => setBooking((b) => ({ mode: 'scheduled', n: (b?.n ?? 0) + 1 }))}
                className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
              >
                <Svg d={ICON.calendar} />
                Book appointment
              </button>
            </div>
          )}
        </header>

        <p className="sr-only" aria-live="polite">
          {notice ?? (showDay && !day.loading ? `${dayName}: ${booked} booked${narrowed ? `, ${filtered.length} shown` : ''}.` : '')}
        </p>
        {notice && (
          <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            <p>{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
              <Svg d={ICON.x} />
            </button>
          </div>
        )}
        {actionError && (
          <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <p>{actionError}</p>
            <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICON.x} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* The day */}
          <div className="flex min-w-0 flex-col gap-4 lg:order-2">
            {/* Day toolbar */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goTo(shiftDay(selected, -1))}
                    aria-label="Previous day"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
                  >
                    <Svg d={ICON.chevL} />
                  </button>
                  <div className="min-w-0 px-1">
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900" aria-live="polite">
                      {dayName}
                    </h2>
                    <p className="text-sm text-gray-500">
                      <span className={relation === 'today' ? 'font-semibold text-brand-teal-deep' : ''}>{relativeDay(selected, today)}</span>
                      {hours?.closed ? ' · clinic closed' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => goTo(shiftDay(selected, 1))}
                    aria-label="Next day"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
                  >
                    <Svg d={ICON.chevR} />
                  </button>
                  {relation !== 'today' && (
                    <button
                      type="button"
                      onClick={() => goTo(today)}
                      className={`ml-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
                    >
                      Today
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="appt-doctor-filter" className="sr-only">
                    Doctor
                  </label>
                  <select id="appt-doctor-filter" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className={`${FIELD} w-auto min-w-44`}>
                    <option value="">All doctors</option>
                    {doctors.map((d) => (
                      <option key={d._id} value={d._id}>
                        Dr. {d.firstName} {d.lastName}
                      </option>
                    ))}
                  </select>
                  {rooms.length > 0 && (
                    <>
                      <label htmlFor="appt-room-filter" className="sr-only">
                        Room
                      </label>
                      <select id="appt-room-filter" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className={`${FIELD} w-auto min-w-36`}>
                        <option value="">All rooms</option>
                        {rooms.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
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
                      className={`motion-chip-in inline-flex items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                    >
                      {c.label}
                      <Svg d={ICON.x} className="h-3.5 w-3.5" />
                    </button>
                  ))}
                  <button type="button" onClick={clearFilters} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {day.error ? (
              <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">The appointments for {dayName} didn&apos;t load ({day.error}).</p>
                <button type="button" onClick={day.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
                  <Svg d={ICON.refresh} />
                  Try again
                </button>
              </div>
            ) : firstLoad ? (
              <DaySkeleton />
            ) : dayItems.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white">
                <Empty
                  icon={ICON.calendar}
                  title={`Nothing booked for ${dayName}`}
                  hint={
                    hours?.closed
                      ? `Business hours in Settings mark ${weekday.charAt(0).toUpperCase() + weekday.slice(1)}s as closed.`
                      : doctorLabel
                        ? `Dr. ${doctorLabel.firstName} ${doctorLabel.lastName} has no appointments this day.`
                        : relation === 'past'
                          ? 'No appointments were recorded for this day.'
                          : 'Bookings for this day will appear here, by doctor and time.'
                  }
                  action={
                    permissions.canBook && relation !== 'past' && !hours?.closed ? (
                      <button
                        type="button"
                        onClick={() => setBooking((b) => ({ mode: 'scheduled', n: (b?.n ?? 0) + 1 }))}
                        className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
                      >
                        <Svg d={ICON.calendar} />
                        Book for this day
                      </button>
                    ) : null
                  }
                />
              </div>
            ) : (
              <div className={`flex flex-col gap-4 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={day.loading}>
                {/* Board */}
                {schedule.appointments.length > 0 && (
                  <section className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="board-title">
                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
                      <div className="min-w-0">
                        <h3 id="board-title" className="text-base font-bold tracking-tight text-gray-900">
                          {doctorLabel ? `Dr. ${doctorLabel.firstName} ${doctorLabel.lastName}'s day` : 'Day by doctor'}
                        </h3>
                        <p className="mt-0.5 truncate text-sm text-gray-500">
                          {schedule.closedToday
                            ? 'Clinic closed this day'
                            : schedule.open && schedule.close
                              ? `Open ${timeLabel(schedule.open)} – ${timeLabel(schedule.close)}`
                              : 'Business hours not set'}
                          {' · '}
                          <span className="font-mono">{schedule.appointments.filter((a) => a.status !== 'cancelled').length}</span> on the board
                          {untimed > 0 && (
                            <>
                              {' · '}
                              <span className="font-mono">{untimed}</span> without a time, listed below
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <ClinicDay
                      key={selected}
                      schedule={schedule}
                      receivedAt={summary.receivedAt}
                      singleLane={doctorLabel ? `Dr. ${doctorLabel.firstName} ${doctorLabel.lastName}` : null}
                      caption={`Appointments for ${dayName}`}
                    />
                  </section>
                )}

                {/* List */}
                <section className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="list-title">
                  <h3 id="list-title" className="sr-only">
                    Appointments for {dayName}
                  </h3>
                  <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
                    <span>Time</span>
                    <span>Patient</span>
                    <span>Doctor</span>
                    <span>Status</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  {filtered.length === 0 ? (
                    <Empty
                      icon={ICON.search}
                      title="No appointments match these filters"
                      hint={`${booked} booked for ${dayName} in all.`}
                      action={
                        <button
                          type="button"
                          onClick={clearFilters}
                          className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
                        >
                          Clear filters
                        </button>
                      }
                    />
                  ) : (
                    <ul key={`${selected}:${stateFilter}:${roomFilter}:${walkInsOnly}`} className="divide-y divide-gray-100">
                      {filtered.map((a, i) => (
                        <Row
                          key={a._id}
                          appointment={a}
                          index={i}
                          relation={relation}
                          inQueue={queuedIds.has(a._id)}
                          permissions={permissions}
                          actions={actions}
                          onOpen={() => router.push(`/appointments/${a._id}`)}
                        />
                      ))}
                    </ul>
                  )}
                  {filtered.length > 0 && (
                    <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                      <span className="font-mono text-gray-900">{filtered.length}</span>
                      {narrowed ? (
                        <>
                          {' '}
                          of <span className="font-mono text-gray-900">{dayItems.length}</span> appointments
                        </>
                      ) : (
                        ` appointment${filtered.length === 1 ? '' : 's'}`
                      )}
                      {permissions.canSeeQueue && relation === 'today' && (
                        <>
                          {' · '}
                          <Link href="/queue" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                            Open the queue
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>

          {/* Month + mix: both choose what the day column shows */}
          <aside className="flex min-w-0 flex-col gap-4 lg:order-1">
            <MonthCalendar
              month={month}
              days={summary.value?.month === month ? summary.value.days : null}
              today={today}
              selected={selected}
              closedWeekdays={closedWeekdays}
              refreshing={summary.loading && summary.value !== null}
              onSelect={goTo}
              onMonth={setMonth}
            />
            {summary.error && (
              <p role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Daily counts didn&apos;t load.
                <button type="button" onClick={summary.reload} className={`rounded font-semibold hover:text-red-900 ${FOCUS_RING}`}>
                  Try again
                </button>
              </p>
            )}
            {showDay && dayItems.length > 0 && (
              <DayMix
                mix={mix}
                walkIns={walkInCount}
                active={stateFilter}
                walkInsOnly={walkInsOnly}
                onState={(k) => setStateFilter((cur) => (cur === k ? null : k))}
                onWalkIns={() => setWalkInsOnly((v) => !v)}
                day={dayLabel(selected, { weekday: 'long' })}
              />
            )}
          </aside>
        </div>
      </div>

      {booking && (
        <BookingModal
          key={booking.n}
          mode={booking.mode}
          date={selected}
          today={today}
          patient={bookingPatient}
          doctors={doctors}
          initialDoctor={booking.n === 0 ? bookingDoctor : undefined}
          defaultDuration={summary.value?.defaultDuration ?? 30}
          canQueue={permissions.canQueue}
          onClose={closeBooking}
          onBooked={(created, message) => {
            closeBooking();
            setActionError(null);
            setNotice(message);
            if (created?.appointmentDate) goTo(localKey(new Date(created.appointmentDate)));
            refreshAll();
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Row({
  appointment: a,
  index,
  relation,
  inQueue,
  permissions,
  actions,
  onOpen,
}: {
  appointment: Appointment;
  index: number;
  relation: ReturnType<typeof relationTo>;
  inQueue: boolean;
  permissions: AppointmentPermissions;
  actions: ReturnType<typeof useAppointmentActions>;
  onOpen: () => void;
}) {
  const st = stateOf(a.status);
  const cancelled = st === 'cancelled';
  const end = endLabel(a);
  const spec = specialty(a);

  // Row click opens the appointment; its own controls, and dialogs portalled out of it, don't.
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target) || target.closest('a,button,input,label')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      {/* Time, with the board's state swatch */}
      <span className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${cancelled ? 'ring-1 ring-inset ring-gray-400' : ''}`}
          style={cancelled ? undefined : { background: STATE[st].fill }}
        />
        <span className="min-w-0">
          <span className={`block font-mono text-sm font-medium tabular-nums ${cancelled ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {timeLabel(a.appointmentTime)}
          </span>
          <span className="block font-mono text-xs text-gray-500 tabular-nums">{end ? `to ${end}` : `${a.duration || 30} min`}</span>
        </span>
      </span>

      {/* Patient */}
      <span className="min-w-0 pl-5 lg:pl-0">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            href={`/appointments/${a._id}`}
            className={`truncate rounded font-semibold hover:text-brand-teal-deep ${cancelled ? 'text-gray-500' : 'text-gray-900'} ${FOCUS_RING}`}
          >
            {patientName(a)}
          </Link>
          {a.isWalkIn && <WalkInBadge n={a.queueNumber} />}
        </span>
        <span className="mt-0.5 block truncate text-sm text-gray-500">
          {a.appointmentCode && <span className="font-mono text-xs">{a.appointmentCode}</span>}
          {a.appointmentCode && a.reason ? ' · ' : ''}
          {a.reason}
        </span>
      </span>

      {/* Doctor */}
      <span className="min-w-0 pl-5 text-sm lg:pl-0">
        <span className="block truncate text-gray-700">{doctorName(a)}</span>
        {(spec || a.room) && <span className="block truncate text-gray-500">{[spec, a.room].filter(Boolean).join(' · ')}</span>}
      </span>

      {/* Status */}
      <span className="flex flex-wrap items-center gap-1.5 pl-5 lg:pl-0">
        <StatusBadge status={a.status} />
        {inQueue && <span className="lg:hidden"><InQueueBadge /></span>}
      </span>

      {/* Actions */}
      <span className="pl-5 lg:pl-0">
        <AppointmentActions appointment={a} relation={relation} inQueue={inQueue} permissions={permissions} actions={actions} />
      </span>
    </li>
  );
}

function DayMix({
  mix,
  walkIns,
  active,
  walkInsOnly,
  onState,
  onWalkIns,
  day,
}: {
  mix: Record<StateKey, number>;
  walkIns: number;
  active: StateKey | null;
  walkInsOnly: boolean;
  onState: (k: StateKey) => void;
  onWalkIns: () => void;
  day: string;
}) {
  const groups = STATE_ORDER.filter((k) => mix[k] > 0);
  const total = groups.reduce((s, k) => s + mix[k], 0);

  return (
    <section className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="mix-title">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 id="mix-title" className="text-base font-bold tracking-tight text-gray-900">
          {day}&apos;s status
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">Pick a status to list only those.</p>
      </div>
      <div className="px-5 py-4">
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
          {groups.map((k, i) => (
            <span
              key={k}
              className={`motion-seg-grow h-full transition-opacity duration-200 ${k === 'cancelled' ? 'ring-1 ring-inset ring-gray-300' : ''}`}
              style={{
                flexGrow: mix[k],
                flexBasis: 0,
                background: k === 'cancelled' ? '#F3F4F6' : STATE[k].fill,
                opacity: active && active !== k ? 0.3 : 1,
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
        <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
          {groups.map((k) => {
            const on = active === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onState(k)}
                  className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-2 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                >
                  <span className="flex items-center gap-2 text-gray-700">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-sm ${k === 'cancelled' ? 'ring-1 ring-inset ring-gray-400' : ''}`}
                      style={k === 'cancelled' ? undefined : { background: STATE[k].fill }}
                    />
                    <span className={on ? 'font-semibold text-gray-900' : ''}>{STATE[k].label}</span>
                  </span>
                  <span className="font-mono tabular-nums text-gray-900">
                    {mix[k]}
                    <span className="ml-2 inline-block w-9 text-right text-gray-500">{Math.round((mix[k] / total) * 100)}%</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {walkIns > 0 && (
          <button
            type="button"
            aria-pressed={walkInsOnly}
            onClick={onWalkIns}
            className={`-mx-2 mt-1 flex w-[calc(100%+1rem)] items-center justify-between rounded border-t border-gray-100 px-2 py-2 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${walkInsOnly ? 'bg-brand-teal-light/60' : ''}`}
          >
            <span className={`flex items-center gap-2 ${walkInsOnly ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
              <Svg d={ICON.walk} className="h-3.5 w-3.5 text-gray-500" />
              Walk-ins
            </span>
            <span className="font-mono tabular-nums text-gray-900">{walkIns}</span>
          </button>
        )}
      </div>
    </section>
  );
}

function Empty({ icon, title, hint, action }: { icon: string; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={icon} className="h-5 w-5" />
      </div>
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{hint}</p>
      {action}
    </div>
  );
}

function DaySkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-hidden="true">
      <div className="h-56 rounded-lg border border-gray-200 bg-white" />
      <div className="rounded-lg border border-gray-200 bg-white">
        <ul className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-4 px-4 py-3.5">
              <span className="h-8 w-20 rounded bg-gray-100" />
              <span className="flex-1 space-y-1.5">
                <span className="block h-3.5 w-40 rounded bg-gray-100" />
                <span className="block h-3 w-24 rounded bg-gray-50" />
              </span>
              <span className="hidden h-3.5 w-28 rounded bg-gray-50 sm:block" />
              <span className="h-5 w-16 rounded bg-gray-100" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
