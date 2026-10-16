'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import PatientSearch, { type PatientOption } from '../patients/PatientSearch';
import type { DoctorOption } from '../appointments/BookingModal';
import { QUEUE_PRIORITY } from '@/lib/queue-order';

const TYPES = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'follow-up', label: 'Follow-up' },
] as const;

const PRIORITIES = [
  { value: QUEUE_PRIORITY.normal, label: 'Normal' },
  { value: QUEUE_PRIORITY.high, label: 'High' },
  { value: QUEUE_PRIORITY.urgent, label: 'Urgent' },
] as const;

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-700">{label}</p>
      <div role="group" aria-label={label} className="inline-flex gap-1 rounded-md border border-gray-200 bg-white p-1">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={`rounded px-3.5 py-1.5 text-sm font-semibold transition-colors duration-150 ${FOCUS_RING} ${
                on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Put a patient in today's queue without an appointment. Booked patients join from the
 * Appointments page instead ("Move to queue"), so their visit stays linked to the booking.
 */
export default function AddToQueueModal({
  doctors,
  onClose,
  onAdded,
}: {
  doctors: DoctorOption[];
  onClose: () => void;
  onAdded: (message: string) => void;
}) {
  const router = useRouter();
  const ids = useId();
  const activeDoctors = useMemo(() => doctors.filter((d) => !d.status || d.status === 'active'), [doctors]);
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [doctor, setDoctor] = useState('');
  const [queueType, setQueueType] = useState<(typeof TYPES)[number]['value']>('walk-in');
  const [priority, setPriority] = useState<number>(QUEUE_PRIORITY.normal);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return setError('Choose a patient from the search results.');
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId: patient._id, doctorId: doctor || undefined, queueType, priority, notes: notes.trim() || undefined }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(formatApiError(data, 'The patient could not be added to the queue'));
      onAdded(`${patient.firstName} ${patient.lastName} is in the queue as ${data.data?.queueNumber ?? 'the next number'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The patient could not be added to the queue');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onOpenChange={(open) => !open && !saving && onClose()} className="max-w-lg" labelledBy={`${ids}-title`}>
      <form onSubmit={submit}>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            Add to the queue
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">For a patient without an appointment. Booked patients join from Appointments.</p>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <PatientSearch value={patient} onChange={setPatient} autoFocus />

          <div>
            <label htmlFor={`${ids}-doctor`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Doctor <span className="font-normal text-gray-500">· optional</span>
            </label>
            <select id={`${ids}-doctor`} value={doctor} onChange={(e) => setDoctor(e.target.value)} className={FIELD}>
              <option value="">Next available doctor</option>
              {activeDoctors.map((d) => (
                <option key={d._id} value={d._id}>
                  Dr. {d.firstName} {d.lastName}
                  {d.specializationId?.name ? ` · ${d.specializationId.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Segmented label="Type" options={TYPES} value={queueType} onChange={setQueueType} />
            <Segmented label="Priority" options={PRIORITIES} value={priority} onChange={setPriority} />
          </div>
          <p className="-mt-2 text-sm text-gray-500">
            {priority === QUEUE_PRIORITY.normal
              ? 'Called in order of arrival.'
              : priority === QUEUE_PRIORITY.high
                ? 'Called before everyone waiting at normal priority.'
                : 'Called first, before everyone else waiting.'}
          </p>

          <div>
            <label htmlFor={`${ids}-notes`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Note for the doctor <span className="font-normal text-gray-500">· optional</span>
            </label>
            <input id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Fever since yesterday" className={FIELD} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`}
          >
            Close
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            {saving ? 'Adding…' : 'Add to queue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
