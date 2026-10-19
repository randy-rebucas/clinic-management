'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '../dashboards/shared';
import {
  AppointmentActions,
  FOCUS_RING,
  ICON,
  Svg,
  WalkInBadge,
  dayLabel,
  doctorName,
  endLabel,
  localKey,
  patientName,
  relationTo,
  specialty,
  timeLabel,
  useAppointmentActions,
  type Appointment,
  type AppointmentPermissions,
} from './shared';

interface QueueEntry {
  _id: string;
  queueNumber: string;
  status: string;
  position?: number;
  appointment?: string | { _id: string } | null;
}

export default function AppointmentDetailClient({ id, permissions }: { id: string; permissions: AppointmentPermissions }) {
  const router = useRouter();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [failure, setFailure] = useState<{ status: number; message: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [today] = useState(() => localKey(new Date()));

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const [res, queueRes] = await Promise.all([
          fetch(`/api/appointments/${id}`, { signal: controller.signal }),
          permissions.canSeeQueue ? fetch('/api/queue?status=waiting,in-progress', { signal: controller.signal }) : Promise.resolve(null),
        ]);
        if (res.status === 401) return router.push('/login');
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          setFailure({ status: res.status, message: json?.error || `Request failed (${res.status})` });
          return;
        }
        setAppointment(json.data);
        setFailure(null);
        const q = queueRes ? await queueRes.json().catch(() => null) : null;
        const entry = (q?.data as QueueEntry[] | undefined)?.find((e) => (typeof e.appointment === 'string' ? e.appointment : e.appointment?._id) === id);
        setQueueEntry(entry ?? null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setFailure({ status: 0, message: err instanceof Error ? err.message : 'Request failed' });
      } finally {
        if (!controller.signal.aborted) setSettled(version);
      }
    };
    load();
    return () => controller.abort();
  }, [id, version, permissions.canSeeQueue, router]);

  const onDone = useCallback((message: string) => {
    setActionError(null);
    setNotice(message);
    setVersion((v) => v + 1);
  }, []);
  const onError = useCallback((message: string) => {
    setNotice(null);
    setActionError(message);
  }, []);
  const actions = useAppointmentActions({ onDone, onError });

  const loading = settled !== version;

  if (failure && !appointment) {
    const missing = failure.status === 404;
    return (
      <Shell>
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing ? ICON.calendar : ICON.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Appointment not found' : "This appointment didn't load"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'It may have been deleted, or it belongs to another clinic.' : `${failure.message}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/appointments" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All appointments
            </Link>
            {!missing && (
              <button type="button" onClick={() => setVersion((v) => v + 1)} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!appointment) {
    return (
      <Shell>
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-80 rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="h-80 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">Loading appointment…</span>
      </Shell>
    );
  }

  const a = appointment;
  const dayKey = localKey(new Date(a.appointmentDate));
  const relation = relationTo(dayKey, today);
  const end = endLabel(a);
  const spec = specialty(a);
  const inQueue = Boolean(queueEntry);
  const isVideo = a.modality === 'teleconsult';
  // A video patient never checks in at the desk, so a scheduled video visit is ready too.
  const visitReady =
    a.patient && relation === 'today' && (a.status === 'confirmed' || a.status === 'completed' || (isVideo && a.status === 'scheduled'));
  const videoOpen = isVideo && relation === 'today' && !['cancelled', 'no-show', 'completed'].includes(a.status);

  return (
    <Shell>
      <Link
        href={`/appointments?date=${dayKey}`}
        className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}
      >
        <Svg d={ICON.chevL} />
        {dayLabel(dayKey, { weekday: 'long', month: 'short', day: 'numeric' })}
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{patientName(a)}</h1>
            <StatusBadge status={a.status} />
            {a.isWalkIn && <WalkInBadge n={a.queueNumber} />}
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            {dayLabel(dayKey, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at{' '}
            <span className="font-mono">{timeLabel(a.appointmentTime)}</span> with {doctorName(a)}
          </p>
        </div>
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <AppointmentActions appointment={a} relation={relation} inQueue={inQueue} permissions={permissions} actions={actions} size="page" />
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
      {notice && (
        <div role="status" className="motion-chip-in rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {notice}
        </div>
      )}
      {actionError && (
        <div role="alert" className="motion-chip-in rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {actionError}
        </div>
      )}

      <div className={`grid gap-6 transition-opacity duration-200 lg:grid-cols-[1.4fr_1fr] ${loading ? 'opacity-60' : ''}`}>
        <section className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="appt-details">
          <h2 id="appt-details" className="border-b border-gray-200 px-5 py-4 text-base font-bold tracking-tight text-gray-900">
            Appointment
          </h2>
          <dl className="divide-y divide-gray-100">
            <Field label="When">
              <span className="font-mono tabular-nums">
                {timeLabel(a.appointmentTime)}
                {end ? `–${end}` : ''}
              </span>
              <span className="text-gray-500"> · {a.duration || 30} min</span>
            </Field>
            <Field label="Doctor">
              {doctorName(a)}
              {spec && <span className="text-gray-500"> · {spec}</span>}
            </Field>
            {isVideo ? (
              <Field label="Where">
                <span className="font-semibold text-brand-teal-deep">Video visit</span>
                <span className="text-gray-500"> · the patient joins from the eMCR app</span>
                {videoOpen && (
                  <a
                    href={`/api/appointments/${a._id}/video`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`mt-2 flex w-fit items-center gap-1.5 rounded-md bg-brand-teal-dark px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
                  >
                    <Svg d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    Join video
                  </a>
                )}
              </Field>
            ) : (
              <Field label="Room">{a.room || <span className="text-gray-400">Not set</span>}</Field>
            )}
            <Field label="Booked as">{a.isWalkIn ? <>Walk-in{a.queueNumber ? <span className="font-mono"> #{a.queueNumber}</span> : null}</> : 'Scheduled appointment'}</Field>
            {permissions.canSeeQueue && (
              <Field label="Queue">
                {queueEntry ? (
                  <>
                    <span className="font-mono font-semibold">{queueEntry.queueNumber}</span>
                    <span className="text-gray-500">
                      {' · '}
                      {queueEntry.status === 'in-progress' ? 'with the doctor now' : queueEntry.position ? `waiting, position ${queueEntry.position}` : 'waiting'}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">Not in the queue</span>
                )}
              </Field>
            )}
            <Field label="Reason">{a.reason || <span className="text-gray-400">None given</span>}</Field>
            {a.notes && <Field label="Notes for staff"><span className="whitespace-pre-line">{a.notes}</span></Field>}
            {a.appointmentCode && (
              <Field label="Reference">
                <span className="font-mono">{a.appointmentCode}</span>
              </Field>
            )}
          </dl>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white overflow-hidden self-start" aria-labelledby="appt-patient">
          <h2 id="appt-patient" className="border-b border-gray-200 px-5 py-4 text-base font-bold tracking-tight text-gray-900">
            Patient
          </h2>
          {a.patient ? (
            <>
              <dl className="divide-y divide-gray-100">
                <Field label="Phone">{a.patient.phone ? <span className="font-mono">{a.patient.phone}</span> : <span className="text-gray-400">Not on file</span>}</Field>
                <Field label="Email">{a.patient.email || <span className="text-gray-400">Not on file</span>}</Field>
              </dl>
              <ul className="border-t border-gray-200 divide-y divide-gray-100">
                <LinkRow href={`/patients/${a.patient._id}`} label="Open patient record" />
                {visitReady && (
                  <LinkRow
                    href={`/visits/new?patientId=${a.patient._id}${isVideo ? '&visitType=teleconsult' : ''}`}
                    label={isVideo ? 'Start the teleconsult note' : 'Start a visit'}
                  />
                )}
                {permissions.canBook && <LinkRow href={`/appointments/new?patientId=${a.patient._id}`} label="Book another appointment" />}
              </ul>
            </>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-500">The patient record is no longer linked to this clinic.</p>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

function LinkRow({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between px-5 py-3 text-sm font-semibold text-brand-teal-dark transition-colors hover:bg-gray-50 hover:text-brand-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal"
      >
        {label}
        <Svg d={ICON.arrow} />
      </Link>
    </li>
  );
}
