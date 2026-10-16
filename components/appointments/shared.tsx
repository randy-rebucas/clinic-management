'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AlertDialog } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { clockLabel, toMinutes } from '../dashboards/charts';

// ---------------------------------------------------------------------------
// Types (the shape /api/appointments returns)
// ---------------------------------------------------------------------------

export type AppointmentStatus = 'pending' | 'scheduled' | 'confirmed' | 'rescheduled' | 'no-show' | 'completed' | 'cancelled';

export interface Appointment {
  _id: string;
  appointmentCode?: string;
  /** Null when the patient record is no longer linked to this clinic. */
  patient: { _id: string; firstName: string; lastName: string; email?: string; phone?: string } | null;
  doctor?: { _id: string; firstName: string; lastName: string; specializationId?: { name?: string } | null } | null;
  provider?: { _id: string; name: string } | null;
  appointmentDate: string;
  appointmentTime?: string;
  duration?: number;
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
  isWalkIn?: boolean;
  queueNumber?: number;
  room?: string;
}

export interface AppointmentPermissions {
  /** appointments:write — book and add walk-ins */
  canBook: boolean;
  /** appointments:update — change status */
  canUpdate: boolean;
  /** queue:read — know who is already in the queue */
  canSeeQueue: boolean;
  /** queue:write — move patients into the queue */
  canQueue: boolean;
}

export type DayRelation = 'past' | 'today' | 'future';

const ACTIVE: AppointmentStatus[] = ['pending', 'scheduled', 'rescheduled', 'confirmed'];
export const isActive = (s: AppointmentStatus) => ACTIVE.includes(s);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
export const FIELD =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30 disabled:bg-gray-50 disabled:text-gray-500';

export function patientName(a: Appointment) {
  return a.patient ? `${a.patient.firstName} ${a.patient.lastName}`.trim() : 'Patient record unavailable';
}

export function doctorName(a: Appointment) {
  if (a.doctor) return `Dr. ${a.doctor.firstName} ${a.doctor.lastName}`;
  if (a.provider) return a.provider.name;
  return 'No doctor assigned';
}

export function specialty(a: Appointment) {
  return a.doctor?.specializationId?.name ?? null;
}

/** "9:30 AM", or an em dash when the booking has no time. */
export function timeLabel(hhmm?: string) {
  const m = toMinutes(hhmm);
  return m === null ? '—' : clockLabel(m);
}

export function endLabel(a: Appointment) {
  const m = toMinutes(a.appointmentTime);
  return m === null ? null : clockLabel(m + (a.duration || 30));
}

/** "yyyy-MM-dd" → a Date at local noon, so formatting never slips a day. */
export const keyToDate = (key: string) => new Date(`${key}T12:00:00`);

export function dayLabel(key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return keyToDate(key).toLocaleDateString('en-US', opts);
}

export function shiftDay(key: string, days: number) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return localKey(d);
}

export function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function relationTo(key: string, today: string): DayRelation {
  return key < today ? 'past' : key > today ? 'future' : 'today';
}

export const statusLabel = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : 'Unknown');

// ---------------------------------------------------------------------------
// Icons (outline, 1.75px)
// ---------------------------------------------------------------------------

export const ICON = {
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  chevL: 'M15 19l-7-7 7-7',
  chevR: 'M9 5l7 7-7 7',
  check: 'M5 13l4 4L19 7',
  x: 'M6 18L18 6M6 6l12 12',
  userX: 'M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1zm13-9l4 4m0-4l-4 4',
  queue: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  walk: 'M13 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9.5 21l1.5-6 2 2v4m-4.5-9.5L10 8l3 1.5 2 3.5m-6.5-1.5L7 14',
  arrow: 'M13 7l5 5m0 0l-5 5m5-5H6',
  alert: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};

export function Svg({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function WalkInBadge({ n }: { n?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">
      Walk-in{n ? <span className="font-mono">#{n}</span> : null}
    </span>
  );
}

export function InQueueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-brand-teal-light px-1.5 py-0.5 text-xs font-semibold text-brand-teal-deep">
      <Svg d={ICON.queue} className="h-3.5 w-3.5" />
      In queue
    </span>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function readJson(res: Response) {
  return res.json().catch(() => ({ success: false, error: `Request failed (${res.status})` }));
}

/**
 * Status changes and queue moves, shared by the day list and the detail page.
 * `onDone` receives a short sentence for the status line; `onError` the failure.
 */
export function useAppointmentActions({ onDone, onError }: { onDone: (message: string) => void; onError: (message: string) => void }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const updateStatus = useCallback(
    async (a: Appointment, status: AppointmentStatus) => {
      setBusyId(a._id);
      try {
        const res = await fetch(`/api/appointments/${a._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (res.status === 401) return router.push('/login');
        const data = await readJson(res);
        if (!res.ok || !data.success) throw new Error(formatApiError(data, 'The appointment could not be updated'));
        const who = patientName(a);
        onDone(
          status === 'confirmed'
            ? `${who}'s appointment is confirmed.`
            : status === 'completed'
              ? `${who} is marked as seen.`
              : status === 'no-show'
                ? `${who} is marked as a no-show.`
                : status === 'cancelled'
                  ? `${who}'s appointment was cancelled.`
                  : `${who}'s appointment was updated.`
        );
      } catch (err) {
        onError(err instanceof Error ? err.message : 'The appointment could not be updated');
      } finally {
        setBusyId(null);
      }
    },
    [router, onDone, onError]
  );

  const moveToQueue = useCallback(
    async (a: Appointment) => {
      if (!a.patient) return onError('This appointment has no linked patient record, so it cannot join the queue.');
      setBusyId(a._id);
      try {
        const res = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: a.patient._id,
            appointmentId: a._id,
            doctorId: a.doctor?._id,
            queueType: a.isWalkIn ? 'walk-in' : 'appointment',
            priority: 0,
            notes: a.notes || a.reason || undefined,
          }),
        });
        if (res.status === 401) return router.push('/login');
        const data = await readJson(res);
        if (!res.ok || !data.success) throw new Error(formatApiError(data, 'The patient could not be added to the queue'));
        onDone(`${patientName(a)} is in the queue as ${data.data?.queueNumber ?? 'the next number'}.`);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'The patient could not be added to the queue');
      } finally {
        setBusyId(null);
      }
    },
    [router, onDone, onError]
  );

  return { busyId, updateStatus, moveToQueue };
}

type Actions = ReturnType<typeof useAppointmentActions>;

/**
 * The next step for an appointment as one labelled button, the rest as quiet icon buttons.
 * Cancelling asks first: it frees the slot and may hand it to the waitlist.
 */
export function AppointmentActions({
  appointment: a,
  relation,
  inQueue,
  permissions,
  actions,
  size = 'row',
}: {
  appointment: Appointment;
  relation: DayRelation;
  inQueue: boolean;
  permissions: AppointmentPermissions;
  actions: Actions;
  size?: 'row' | 'page';
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const busy = actions.busyId === a._id;
  const unconfirmed = a.status === 'pending' || a.status === 'scheduled' || a.status === 'rescheduled';
  const canMove = permissions.canQueue && a.status === 'confirmed' && relation === 'today' && !inQueue && Boolean(a.patient);

  let primary: { label: string; icon: string; run: () => void } | null = null;
  if (unconfirmed && permissions.canUpdate) primary = { label: 'Confirm', icon: ICON.check, run: () => actions.updateStatus(a, 'confirmed') };
  else if (canMove) primary = { label: 'Move to queue', icon: ICON.queue, run: () => actions.moveToQueue(a) };
  else if (a.status === 'confirmed' && permissions.canUpdate) primary = { label: 'Mark seen', icon: ICON.check, run: () => actions.updateStatus(a, 'completed') };

  const secondary: { label: string; icon: string; danger?: boolean; run: () => void }[] = [];
  if (permissions.canUpdate && isActive(a.status)) {
    if (a.status === 'confirmed' && primary?.label !== 'Mark seen')
      secondary.push({ label: 'Mark seen', icon: ICON.check, run: () => actions.updateStatus(a, 'completed') });
    if (relation !== 'future') secondary.push({ label: 'Mark as no-show', icon: ICON.userX, run: () => actions.updateStatus(a, 'no-show') });
    secondary.push({ label: 'Cancel appointment', icon: ICON.x, danger: true, run: () => setConfirmCancel(true) });
  }

  const who = patientName(a);
  const pad = size === 'page' ? 'px-4 py-2' : 'px-3 py-1.5';

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {inQueue && size === 'row' && <InQueueBadge />}
        {primary && (
          <button
            type="button"
            onClick={primary.run}
            disabled={busy}
            aria-label={`${primary.label}: ${who}`}
            className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white ${pad} text-sm font-semibold text-gray-900 transition-colors hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep disabled:cursor-wait disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Svg d={primary.icon} />
            {busy ? 'Saving…' : primary.label}
          </button>
        )}
        {secondary.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={s.run}
            disabled={busy}
            aria-label={`${s.label}: ${who}`}
            title={s.label}
            className={`rounded-md p-2 text-gray-500 transition-colors disabled:opacity-40 ${FOCUS_RING} ${
              s.danger ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-brand-teal-light hover:text-brand-teal-deep'
            }`}
          >
            <Svg d={s.icon} />
          </button>
        ))}
      </div>
      {/* Portalled: a row's entrance transform would otherwise trap the fixed overlay. */}
      {confirmCancel &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(open) => !open && setConfirmCancel(false)}
            title="Cancel this appointment?"
            description={`${who}, ${dayLabel(localKey(new Date(a.appointmentDate)), { weekday: 'short', month: 'short', day: 'numeric' })} at ${timeLabel(a.appointmentTime)}. The slot opens up and may be offered to the waitlist.`}
          >
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
            >
              Keep appointment
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmCancel(false);
                actions.updateStatus(a, 'cancelled');
              }}
              className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}
            >
              Cancel appointment
            </button>
          </AlertDialog>,
          document.body
        )}
    </>
  );
}
