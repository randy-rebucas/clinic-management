'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { clockLabel, toMinutes } from '../dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg, dayLabel, timeLabel, type Appointment } from './shared';
import PatientSearch, { type PatientOption } from '../patients/PatientSearch';

export type { PatientOption };

export interface DoctorOption {
  _id: string;
  firstName: string;
  lastName: string;
  status?: string;
  specializationId?: { name?: string } | null;
}

export type BookingMode = 'scheduled' | 'walk-in';

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Book an appointment or add a walk-in. Mounted fresh for each use (the parent keys it),
 * so nothing from a previous booking leaks into the next.
 */
export default function BookingModal({
  mode,
  date,
  today,
  patient: initialPatient,
  doctors,
  initialDoctor,
  defaultDuration,
  canQueue,
  onClose,
  onBooked,
}: {
  mode: BookingMode;
  /** Day to prefill for a scheduled booking (the day being viewed). */
  date: string;
  today: string;
  patient: PatientOption | null;
  doctors: DoctorOption[];
  /** Doctor to start with (booking from a doctor's page). */
  initialDoctor?: string;
  defaultDuration: number;
  canQueue: boolean;
  onClose: () => void;
  onBooked: (appointment: Appointment, message: string) => void;
}) {
  const router = useRouter();
  const walkIn = mode === 'walk-in';
  const ids = useId();

  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);

  const activeDoctors = useMemo(() => doctors.filter((d) => !d.status || d.status === 'active'), [doctors]);
  const [doctor, setDoctor] = useState(
    initialDoctor && activeDoctors.some((d) => d._id === initialDoctor) ? initialDoctor : activeDoctors.length === 1 ? activeDoctors[0]._id : ''
  );
  const [day, setDay] = useState(walkIn ? today : date < today ? today : date);
  const [time, setTime] = useState(walkIn || date === today ? nowHHmm() : '');
  const durationChoices = DURATIONS.includes(defaultDuration) ? DURATIONS : [...DURATIONS, defaultDuration].sort((a, b) => a - b);
  const [duration, setDuration] = useState(defaultDuration);
  const [status, setStatus] = useState<'scheduled' | 'confirmed' | 'pending'>('scheduled');
  const [room, setRoom] = useState('');
  const [video, setVideo] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState<{ key: string; items: Appointment[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The doctor's other bookings that day, so a double booking is visible before it is refused.
  const busyKey = doctor && day ? `${doctor}:${day}` : null;
  useEffect(() => {
    if (!busyKey) return;
    const [doctorId, d] = busyKey.split(':');
    const controller = new AbortController();
    fetch(`/api/appointments?${new URLSearchParams({ date: d, doctorId, status: 'pending,scheduled,confirmed,rescheduled', limit: '100' })}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => setBusy({ key: busyKey, items: json?.success ? json.data : [] }))
      .catch(() => {
        /* The hint is optional; the server still refuses a clash. */
      });
    return () => controller.abort();
  }, [busyKey]);

  const taken = busy?.key === busyKey ? busy.items : [];
  const start = toMinutes(time);
  const clash =
    start === null
      ? null
      : taken.find((a) => {
          const s = toMinutes(a.appointmentTime);
          return s !== null && start < s + (a.duration || 30) && s < start + duration;
        }) ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) {
      setError('Choose a patient from the search results.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: patient._id,
          doctor: doctor || undefined,
          room: video ? undefined : room.trim() || undefined,
          modality: !walkIn && video ? 'teleconsult' : 'in-person',
          appointmentDate: walkIn ? today : day,
          appointmentTime: time || undefined,
          duration,
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
          // A walk-in is already at the desk.
          status: walkIn ? 'confirmed' : status,
          isWalkIn: walkIn,
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json().catch(() => ({ success: false, error: `Request failed (${res.status})` }));
      if (!res.ok || !data.success) throw new Error(formatApiError(data, 'The appointment could not be booked'));

      const created = data.data as Appointment;
      const who = `${patient.firstName} ${patient.lastName}`;
      if (!walkIn) {
        onBooked(
          created,
          `${who} is booked for ${video ? 'a video visit on ' : ''}${dayLabel(day, { weekday: 'short', month: 'short', day: 'numeric' })} at ${timeLabel(time)}.${video ? ' They join from the patient app.' : ''}`
        );
        return;
      }

      let message = `${who} is checked in as walk-in #${created.queueNumber ?? '—'}.`;
      if (canQueue) {
        const q = await fetch('/api/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: patient._id, appointmentId: created._id, doctorId: doctor || undefined, queueType: 'walk-in', priority: 0, notes: reason.trim() || undefined }),
        });
        const qData = await q.json().catch(() => null);
        message =
          q.ok && qData?.success
            ? `${who} is checked in as walk-in #${created.queueNumber ?? '—'} and waiting in the queue as ${qData.data?.queueNumber}.`
            : `${who} is checked in as walk-in #${created.queueNumber ?? '—'}, but could not join the queue (${formatApiError(qData, 'queue unavailable')}). Use Move to queue on their row.`;
      }
      onBooked(created, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The appointment could not be booked');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onOpenChange={(open) => !open && !submitting && onClose()} className="max-w-2xl" labelledBy={`${ids}-title`}>
      <form onSubmit={submit}>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {walkIn ? 'Add a walk-in' : 'Book an appointment'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {walkIn
              ? `For a patient at the desk now. ${canQueue ? 'They join the queue as soon as you save.' : 'They are booked for today.'}`
              : 'Pick the patient, doctor and time. A doctor cannot be double-booked.'}
          </p>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Patient */}
          <PatientSearch value={patient} onChange={setPatient} autoFocus={!initialPatient} />

          {/* Doctor */}
          <div>
            <label htmlFor={`${ids}-doctor`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Doctor
            </label>
            <select id={`${ids}-doctor`} required value={doctor} onChange={(e) => setDoctor(e.target.value)} className={FIELD}>
              <option value="">Choose a doctor</option>
              {activeDoctors.map((d) => (
                <option key={d._id} value={d._id}>
                  Dr. {d.firstName} {d.lastName}
                  {d.specializationId?.name ? ` · ${d.specializationId.name}` : ''}
                </option>
              ))}
            </select>
            {activeDoctors.length === 0 && (
              <p className="mt-1.5 text-sm text-gray-600">No active doctors yet. An administrator can add one under Doctors.</p>
            )}
          </div>

          {/* When */}
          <div className={`grid gap-4 ${walkIn ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {!walkIn && (
              <div>
                <label htmlFor={`${ids}-date`} className="mb-1.5 block text-sm font-medium text-gray-700">
                  Date
                </label>
                <input id={`${ids}-date`} type="date" required min={today} value={day} onChange={(e) => setDay(e.target.value)} className={`${FIELD} font-mono`} />
              </div>
            )}
            <div>
              <label htmlFor={`${ids}-time`} className="mb-1.5 block text-sm font-medium text-gray-700">
                {walkIn ? 'Arrived at' : 'Time'}
              </label>
              <input id={`${ids}-time`} type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={`${FIELD} font-mono`} />
            </div>
            <div>
              <label htmlFor={`${ids}-duration`} className="mb-1.5 block text-sm font-medium text-gray-700">
                Length
              </label>
              <select id={`${ids}-duration`} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${FIELD} font-mono`}>
                {durationChoices.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* The doctor's day */}
          {doctor && day && (
            <div className="-mt-1 rounded-md bg-gray-50 px-3.5 py-3 text-sm" aria-live="polite">
              {busy?.key !== busyKey ? (
                <p className="text-gray-500">Checking the doctor&apos;s day…</p>
              ) : taken.length === 0 ? (
                <p className="text-gray-600">
                  Nothing else booked with this doctor on {dayLabel(walkIn ? today : day, { weekday: 'short', month: 'short', day: 'numeric' })}.
                </p>
              ) : (
                <>
                  <p className="text-gray-600">Already booked that day</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {taken
                      .filter((a) => toMinutes(a.appointmentTime) !== null)
                      .sort((a, b) => (toMinutes(a.appointmentTime) ?? 0) - (toMinutes(b.appointmentTime) ?? 0))
                      .map((a) => {
                        const s = toMinutes(a.appointmentTime) ?? 0;
                        const isClash = clash?._id === a._id;
                        return (
                          <li
                            key={a._id}
                            className={`rounded px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset ${
                              isClash ? 'bg-amber-50 font-semibold text-amber-900 ring-amber-300' : 'bg-white text-gray-700 ring-gray-200'
                            }`}
                          >
                            {clockLabel(s)}–{clockLabel(s + (a.duration || 30))}
                          </li>
                        );
                      })}
                  </ul>
                  {clash && (
                    <p className="mt-2 flex items-start gap-1.5 font-medium text-amber-900">
                      <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
                      {walkIn
                        ? `Overlaps the ${timeLabel(clash.appointmentTime)} booking. The walk-in will wait in the queue.`
                        : `Overlaps the ${timeLabel(clash.appointmentTime)} booking. Pick another time or doctor.`}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className={`grid gap-4 ${walkIn ? '' : 'sm:grid-cols-2'}`}>
            {!walkIn && (
              <div>
                <label htmlFor={`${ids}-status`} className="mb-1.5 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select id={`${ids}-status`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={FIELD}>
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed with the patient</option>
                  <option value="pending">Pending (needs follow-up)</option>
                </select>
              </div>
            )}
            {!video && (
              <div>
                <label htmlFor={`${ids}-room`} className="mb-1.5 block text-sm font-medium text-gray-700">
                  Room <span className="font-normal text-gray-500">· optional</span>
                </label>
                <input id={`${ids}-room`} type="text" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Consultation Room A" className={FIELD} />
              </div>
            )}
          </div>

          {!walkIn && (
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-gray-700">Where</legend>
              <div className="inline-flex gap-1 rounded-md border border-gray-300 bg-white p-1">
                {[
                  { value: false, label: 'In the clinic' },
                  { value: true, label: 'Video visit' },
                ].map((o) => (
                  <label
                    key={o.label}
                    className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input type="radio" name={`${ids}-where`} checked={video === o.value} onChange={() => setVideo(o.value)} className="sr-only" />
                    {o.label}
                  </label>
                ))}
              </div>
              {video && (
                <p className="mt-1.5 text-sm text-gray-600">
                  The patient joins from the eMCR app, from 15 minutes before the start. You join from the appointment page.
                </p>
              )}
            </fieldset>
          )}

          <div>
            <label htmlFor={`${ids}-reason`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Reason for visit <span className="font-normal text-gray-500">· optional</span>
            </label>
            <input id={`${ids}-reason`} type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Follow-up, fever, BP check" className={FIELD} />
          </div>

          <div>
            <label htmlFor={`${ids}-notes`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Notes for staff <span className="font-normal text-gray-500">· optional</span>
            </label>
            <textarea id={`${ids}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${FIELD} resize-y`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`}
          >
            Close
          </button>
          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            {submitting ? 'Saving…' : walkIn ? 'Add walk-in' : 'Book appointment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
