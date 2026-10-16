'use client';

import { useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { formatApiError } from '../utils/apiError';
import {
  WEEKDAY_LONG,
  WEEK_ORDER,
  hoursProblems,
  hoursRange,
  timeOffDate,
  timeOffInstant,
  toMin,
  weekdayOf,
  type TimeOff,
  type WeeklyHours,
} from '@/lib/doctors';

// ---------------------------------------------------------------------------
// Weekly hours editor
// ---------------------------------------------------------------------------

export interface HoursRow {
  dayOfWeek: number;
  on: boolean;
  start: string;
  end: string;
}

export function hoursRows(schedule: WeeklyHours[] = []): HoursRow[] {
  return WEEK_ORDER.map((day) => {
    const s = schedule.find((x) => x.dayOfWeek === day);
    return { dayOfWeek: day, on: Boolean(s && s.isAvailable !== false), start: s?.startTime ?? '09:00', end: s?.endTime ?? '17:00' };
  });
}

export const rowsToSchedule = (rows: HoursRow[]): WeeklyHours[] =>
  rows.filter((r) => r.on).map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.start, endTime: r.end, isAvailable: true }));

export const rowsProblems = (rows: HoursRow[]) => hoursProblems(rowsToSchedule(rows));

/**
 * The week as seven ruled rows, working week first: a checkbox per day, then from/to times. One
 * shortcut copies Monday's hours to Tuesday–Friday, the common case.
 */
export function HoursEditor({ rows, onChange, problems, showProblems }: { rows: HoursRow[]; onChange: (rows: HoursRow[]) => void; problems: Record<number, string>; showProblems: boolean }) {
  const ids = useId();
  const monday = rows.find((r) => r.dayOfWeek === 1)!;
  const set = (day: number, patch: Partial<HoursRow>) => onChange(rows.map((r) => (r.dayOfWeek === day ? { ...r, ...patch } : r)));
  const totalMinutes = rows.reduce((sum, r) => {
    const a = toMin(r.start);
    const b = toMin(r.end);
    return r.on && a !== null && b !== null && b > a ? sum + (b - a) : sum;
  }, 0);

  return (
    <div>
      <ul className="divide-y divide-gray-100">
        {rows.map((r) => {
          const problem = showProblems ? problems[r.dayOfWeek] : undefined;
          return (
            <li key={r.dayOfWeek} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-5 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-900">
                <input
                  type="checkbox"
                  checked={r.on}
                  onChange={(e) => set(r.dayOfWeek, { on: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
                />
                {WEEKDAY_LONG[r.dayOfWeek]}
              </label>
              {r.on ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`${ids}-${r.dayOfWeek}-a`} className="sr-only">
                    {WEEKDAY_LONG[r.dayOfWeek]} from
                  </label>
                  <input
                    id={`${ids}-${r.dayOfWeek}-a`}
                    type="time"
                    value={r.start}
                    onChange={(e) => set(r.dayOfWeek, { start: e.target.value })}
                    aria-invalid={Boolean(problem)}
                    className={`${FIELD} w-32 font-mono ${problem ? 'border-red-400' : ''}`}
                  />
                  <span className="text-sm text-gray-500" aria-hidden="true">
                    to
                  </span>
                  <label htmlFor={`${ids}-${r.dayOfWeek}-b`} className="sr-only">
                    {WEEKDAY_LONG[r.dayOfWeek]} until
                  </label>
                  <input
                    id={`${ids}-${r.dayOfWeek}-b`}
                    type="time"
                    value={r.end}
                    onChange={(e) => set(r.dayOfWeek, { end: e.target.value })}
                    aria-invalid={Boolean(problem)}
                    className={`${FIELD} w-32 font-mono ${problem ? 'border-red-400' : ''}`}
                  />
                </div>
              ) : (
                <span className="text-sm text-gray-500">Not working</span>
              )}
              {problem && (
                <div className="col-start-2">
                  <FieldError id={`${ids}-${r.dayOfWeek}-err`}>{problem}</FieldError>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
        <p className="text-sm text-gray-600">
          {totalMinutes > 0 ? (
            <>
              <span className="font-mono text-gray-900">{Math.round((totalMinutes / 60) * 10) / 10}</span> hours a week
            </>
          ) : (
            'No working days yet. Leave it empty if the hours aren’t known.'
          )}
        </p>
        {monday.on && (
          <button
            type="button"
            onClick={() => onChange(rows.map((r) => (r.dayOfWeek >= 2 && r.dayOfWeek <= 5 ? { ...r, on: true, start: monday.start, end: monday.end } : r)))}
            className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}
          >
            Use Monday’s hours Tuesday to Friday
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saving to the schedule route
// ---------------------------------------------------------------------------

function useScheduleSave(doctorId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (body: { schedule?: WeeklyHours[]; availabilityOverrides?: TimeOff[] }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctors/${doctorId}/schedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) {
        router.push('/login');
        return false;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'The hours could not be saved'));
        setBusy(false);
        return false;
      }
      return true;
    } catch {
      setError('The server couldn’t be reached. Nothing was saved; try again.');
      setBusy(false);
      return false;
    }
  };
  return { busy, error, setError, save };
}

/** Overrides as the schedule route takes them back (dates as instants, no subdocument ids). */
export const overridesBody = (list: TimeOff[]) =>
  list.map((o) => ({ date: o.date, isAvailable: o.isAvailable, ...(o.startTime ? { startTime: o.startTime } : {}), ...(o.endTime ? { endTime: o.endTime } : {}), ...(o.reason ? { reason: o.reason } : {}) }));

function DialogFrame({ title, hint, error, onDismissError, children }: { title: string; hint?: string; error: string | null; onDismissError: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-bold tracking-tight text-gray-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      </div>
      {error && (
        <div role="alert" className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          <p>{error}</p>
          <button type="button" onClick={onDismissError} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

function Footer({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
      <button type="button" onClick={onCancel} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
        Cancel
      </button>
      <button type="submit" disabled={busy} aria-busy={busy} className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:opacity-60 ${FOCUS_RING}`}>
        <Svg d={ICON.check} />
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export function HoursDialog({ doctorId, name, schedule, onClose, onDone }: { doctorId: string; name: string; schedule: WeeklyHours[]; onClose: () => void; onDone: (message: string) => void }) {
  const [rows, setRows] = useState(() => hoursRows(schedule));
  const [attempted, setAttempted] = useState(false);
  const { busy, error, setError, save } = useScheduleSave(doctorId);
  const problems = rowsProblems(rows);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (Object.keys(problems).length) return;
    if (await save({ schedule: rowsToSchedule(rows) })) onDone('Weekly hours saved.');
  };

  return createPortal(
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-xl">
      <form onSubmit={submit} noValidate>
        <DialogFrame title={`Weekly hours, ${name}`} hint="The hours the doctor usually works. A single day off or different hours go under Time off." error={error} onDismissError={() => setError(null)}>
          <HoursEditor rows={rows} onChange={setRows} problems={problems} showProblems={attempted} />
        </DialogFrame>
        <Footer busy={busy} label="Save hours" onCancel={onClose} />
      </form>
    </Modal>,
    document.body
  );
}

export function TimeOffDialog({
  doctorId,
  name,
  today,
  schedule,
  overrides,
  onClose,
  onDone,
}: {
  doctorId: string;
  name: string;
  today: string;
  schedule: WeeklyHours[];
  overrides: TimeOff[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<'off' | 'hours'>('off');
  const usual = schedule.find((s) => date && s.dayOfWeek === weekdayOf(date) && s.isAvailable !== false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const { busy, error, setError, save } = useScheduleSave(doctorId);

  const existing = overrides.find((o) => timeOffDate(o.date) === date);
  const a = toMin(start || usual?.startTime);
  const b = toMin(end || usual?.endTime);
  const problems = {
    date: !date ? 'Pick the day.' : date < today ? 'Pick today or a later day.' : undefined,
    hours: kind === 'hours' ? (a === null || b === null ? 'Enter both times.' : b <= a ? 'The day must end after it starts.' : undefined) : undefined,
  };
  const hasProblem = Boolean(problems.date || problems.hours);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (hasProblem) return;
    const entry: TimeOff = {
      date: timeOffInstant(date),
      isAvailable: kind === 'hours',
      ...(kind === 'hours' ? { startTime: start || usual?.startTime, endTime: end || usual?.endTime } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    const list = [...overrides.filter((o) => timeOffDate(o.date) !== date), entry];
    if (await save({ availabilityOverrides: overridesBody(list) })) {
      onDone(kind === 'off' ? 'Time off saved. Check any bookings already on that day.' : 'Changed hours saved.');
    }
  };

  return createPortal(
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-md">
      <form onSubmit={submit} noValidate>
        <DialogFrame title={`Time off, ${name}`} hint="One day away, or one day on different hours." error={error} onDismissError={() => setError(null)}>
          <div className="space-y-4 px-5 py-4">
            <div>
              <Label htmlFor={`${ids}-date`}>Day</Label>
              <input
                id={`${ids}-date`}
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={attempted && Boolean(problems.date)}
                className={`${FIELD} font-mono ${attempted && problems.date ? 'border-red-400' : ''}`}
              />
              {attempted && problems.date ? (
                <FieldError id={`${ids}-date-err`}>{problems.date}</FieldError>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  {date ? (usual ? `Usually ${hoursRange(usual.startTime, usual.endTime)} on ${WEEKDAY_LONG[weekdayOf(date)]}s.` : `Not usually working on ${WEEKDAY_LONG[weekdayOf(date)]}s.`) : ''}
                  {existing && ' Replaces what is already set for this day.'}
                </p>
              )}
            </div>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-gray-700">That day</legend>
              <div className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
                {(
                  [
                    ['off', 'Away all day'],
                    ['hours', 'Different hours'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input type="radio" name={`${ids}-kind`} value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {kind === 'hours' && (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={`${ids}-a`} className="sr-only">
                    From
                  </label>
                  <input id={`${ids}-a`} type="time" value={start || usual?.startTime || ''} onChange={(e) => setStart(e.target.value)} className={`${FIELD} w-32 font-mono`} />
                  <span className="text-sm text-gray-500" aria-hidden="true">
                    to
                  </span>
                  <label htmlFor={`${ids}-b`} className="sr-only">
                    Until
                  </label>
                  <input id={`${ids}-b`} type="time" value={end || usual?.endTime || ''} onChange={(e) => setEnd(e.target.value)} className={`${FIELD} w-32 font-mono`} />
                </div>
                {attempted && problems.hours && <FieldError id={`${ids}-h-err`}>{problems.hours}</FieldError>}
              </div>
            )}
            <div>
              <Label htmlFor={`${ids}-why`} optional>
                Reason
              </Label>
              <input id={`${ids}-why`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Medical conference" className={FIELD} />
              <p className="mt-1.5 text-xs text-gray-500">Shown to staff on the roster.</p>
            </div>
          </div>
        </DialogFrame>
        <Footer busy={busy} label="Save" onCancel={onClose} />
      </form>
    </Modal>,
    document.body
  );
}

/** Remove one day of time off (the page confirms first). */
export async function removeTimeOff(doctorId: string, overrides: TimeOff[], key: string) {
  const res = await fetch(`/api/doctors/${doctorId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availabilityOverrides: overridesBody(overrides.filter((o) => timeOffDate(o.date) !== key)) }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The time off could not be removed'));
}
