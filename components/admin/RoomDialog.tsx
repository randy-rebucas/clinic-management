'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { useSend } from './users-shared';
import ItemList from './ItemList';
import { ROOM_STATUS, ROOM_STATUSES, ROOM_TYPES, ROOM_TYPE_LABEL, roomKey, type RoomRow, type RoomStatus, type RoomType } from '@/lib/rooms';

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;
const SEGMENT = 'cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal';

/** Values a new room starts with (from a room typed on bookings, or the type filter). */
export interface RoomPreset {
  name?: string;
  roomType?: RoomType;
}

interface Form {
  name: string;
  roomNumber: string;
  roomType: RoomType;
  building: string;
  floor: string;
  capacity: string;
  equipment: string[];
  amenities: string[];
  status: RoomStatus;
  notes: string;
}

type FieldKey = 'name' | 'floor' | 'capacity';

function initialForm(row: RoomRow | null, preset?: RoomPreset): Form {
  return {
    name: row?.name ?? preset?.name ?? '',
    roomNumber: row?.roomNumber ?? '',
    roomType: row?.roomType ?? preset?.roomType ?? 'consultation',
    building: row?.building ?? '',
    floor: row?.floor !== null && row?.floor !== undefined ? String(row.floor) : '',
    capacity: row?.capacity ? String(row.capacity) : '',
    equipment: row?.equipment ?? [],
    amenities: row?.amenities ?? [],
    status: row?.status ?? 'available',
    notes: row?.notes ?? '',
  };
}

function problems(f: Form): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (!f.name.trim()) out.name = 'Enter the room’s name, as staff say it.';
  if (f.floor.trim() !== '' && !/^-?\d+$/.test(f.floor.trim())) out.floor = 'A whole number (0 for the ground floor), or leave it blank.';
  if (f.capacity.trim() !== '' && !/^[1-9]\d*$/.test(f.capacity.trim())) out.capacity = 'How many people fit, 1 or more, or leave it blank.';
  return out;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="px-6 py-5">
      <h3 className="text-sm font-bold tracking-tight text-gray-900">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function RoomDialog({
  row,
  preset,
  rows,
  onClose,
  onSaved,
}: {
  /** null = add a new room. */
  row: RoomRow | null;
  preset?: RoomPreset;
  /** Every room, for name clashes. */
  rows: RoomRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('The room couldn’t be saved');
  const [form, setForm] = useState<Form>(() => initialForm(row, preset));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});

  const editing = row !== null;
  const issues = tried ? problems(form) : {};
  const issueCount = Object.keys(issues).length;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const sameName = form.name.trim() ? rows.find((r) => r._id !== row?._id && roomKey(r.name) === roomKey(form.name)) : undefined;
  const closing = form.status !== 'available';
  const comingBookings = row ? row.booked.today + row.booked.ahead : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const found = problems(form);
    const firstBad = (Object.keys(found) as FieldKey[])[0];
    if (firstBad) {
      refs.current[firstBad]?.focus();
      return;
    }
    setBusy(true);
    setError(null);

    const num = (s: string) => (s.trim() === '' ? null : parseInt(s, 10));
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      roomNumber: form.roomNumber.trim(),
      roomType: form.roomType,
      building: form.building.trim(),
      floor: num(form.floor),
      capacity: num(form.capacity),
      equipment: form.equipment,
      amenities: form.amenities,
      status: form.status,
      notes: form.notes.trim(),
    };
    if (!editing) for (const key of Object.keys(body)) if (body[key] === '' || body[key] === null) delete body[key];

    const result = await send(editing ? `/api/rooms/${row._id}` : '/api/rooms', editing ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = form.name.trim();
    if (!editing) onSaved(`Added ${name}.`);
    else if (row.status !== form.status) onSaved(`${name} is now ${ROOM_STATUS[form.status].label.toLowerCase()}.`);
    else onSaved(`Saved ${name}.`);
  };

  const input = (key: FieldKey | 'roomNumber' | 'building', label: ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => {
    const err = key === 'name' || key === 'floor' || key === 'capacity' ? issues[key] : undefined;
    return (
      <div>
        <Label htmlFor={`${ids}-${key}`} optional={optional}>
          {label}
        </Label>
        <input
          id={`${ids}-${key}`}
          ref={(el) => {
            if (key === 'name' || key === 'floor' || key === 'capacity') refs.current[key] = el;
          }}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
          aria-invalid={!!err}
          aria-describedby={err ? `${ids}-${key}-err` : undefined}
          autoComplete="off"
          {...props}
          className={`${FIELD} ${err ? 'border-red-400' : ''} ${props.className ?? ''}`}
        />
        {err && <FieldError id={`${ids}-${key}-err`}>{err}</FieldError>}
      </div>
    );
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-2xl" labelledBy={`${ids}-title`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {editing ? row.name : 'Add a room'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {editing
              ? row.history > 0
                ? 'Patients have been seen here, so the room is kept for their records. Mark it closed to stop using it.'
                : 'No patient has been seen here yet.'
              : 'Staff name it on bookings, and the queue can give it to the next patient once it’s open.'}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="What it is">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div>
                  {input('name', 'Name', { maxLength: 200, placeholder: 'e.g. Consultation room A' })}
                  {sameName && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
                      <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      There is already a room with this name.
                    </p>
                  )}
                </div>
                {input('roomNumber', 'Number', { maxLength: 50, placeholder: 'e.g. 101', className: 'font-mono tabular-nums' }, true)}
              </div>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-gray-700">Used for</legend>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1 sm:grid-cols-5">
                  {ROOM_TYPES.map((t) => {
                    const on = form.roomType === t;
                    return (
                      <label key={t} className={`${SEGMENT} ${on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <input type="radio" name={`${ids}-type`} value={t} checked={on} onChange={() => set('roomType', t)} className="sr-only" />
                        {ROOM_TYPE_LABEL[t]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </Section>

          <Section title="Where it is">
            <div className="grid gap-4 sm:grid-cols-3">
              {input('building', 'Building', { maxLength: 200, placeholder: 'e.g. Main building' }, true)}
              {input('floor', 'Floor', { inputMode: 'numeric', placeholder: '0 = ground', className: 'font-mono tabular-nums' }, true)}
              {input('capacity', 'People it fits', { inputMode: 'numeric', className: 'font-mono tabular-nums' }, true)}
            </div>
          </Section>

          <Section title="What’s in it" hint="Type an item and press Enter. Staff search rooms by these.">
            <div className="space-y-4">
              <ItemList id={`${ids}-equipment`} label="Equipment" values={form.equipment} onChange={(v) => set('equipment', v)} placeholder="e.g. Exam table, ECG machine" />
              <ItemList id={`${ids}-amenities`} label="Comforts" values={form.amenities} onChange={(v) => set('amenities', v)} placeholder="e.g. Air conditioning, wheelchair access" />
            </div>
          </Section>

          <Section title="Can it be used?">
            <fieldset>
              <legend className="sr-only">Status</legend>
              <div className="grid grid-cols-1 gap-1 rounded-md border border-gray-300 bg-white p-1 sm:grid-cols-3">
                {ROOM_STATUSES.map((s) => {
                  const on = form.status === s;
                  return (
                    <label key={s} className={`${SEGMENT} ${on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                      <input type="radio" name={`${ids}-status`} value={s} checked={on} onChange={() => set('status', s)} className="sr-only" />
                      {ROOM_STATUS[s].label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <p className="mt-2 text-sm text-gray-600">
              {ROOM_STATUS[form.status].hint}
              {closing && ' The queue won’t give it to patients.'}
            </p>
            {closing && row && row.inUse.length > 0 && (
              <p className="motion-panel-in mt-2 flex items-start gap-1.5 text-sm text-amber-800">
                <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {row.inUse.map((o) => o.queueNumber).join(', ')} {row.inUse.length === 1 ? 'is' : 'are'} in this room now and can finish there.
              </p>
            )}
            {closing && comingBookings > 0 && (
              <p className="motion-panel-in mt-2 flex items-start gap-1.5 text-sm text-amber-800">
                <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {comingBookings} {comingBookings === 1 ? 'booking' : 'bookings'} from today on still name this room. Move them on the schedule if they need another.
              </p>
            )}
          </Section>

          <Section title="Notes for staff">
            <Label htmlFor={`${ids}-notes`} optional>
              Notes
            </Label>
            <textarea id={`${ids}-notes`} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={5000} className={FIELD} />
          </Section>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || issueCount ? 'font-medium text-red-700' : 'text-gray-500'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ?? (issueCount ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} fixing.` : busy ? 'Saving…' : 'Changes are recorded in the audit log.')}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add the room'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
