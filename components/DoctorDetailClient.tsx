'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { SERIES, TrendChart } from './dashboards/charts';
import { useMoney } from './invoices/shared';
import { NoteArea, REMOVE_BUTTON } from './visits/form/parts';
import { HoursDialog, TimeOffDialog, removeTimeOff } from './doctors/ScheduleDialogs';
import { DOCTOR_STATE, doctorName, specialtyOf, statusOf, type DoctorRow } from './doctors/shared';
import {
  WEEKDAY_KEYS,
  WEEKDAY_LONG,
  WEEK_ORDER,
  dayHours,
  hoursRange,
  timeOffDate,
  toMin,
  weekdayOf,
  type BusinessDay,
  type TimeOff,
} from '@/lib/doctors';
import type { DoctorPermissions } from '@/lib/doctors-page';

interface Note {
  _id: string;
  note: string;
  createdBy?: { _id: string; name: string } | null;
  createdAt: string;
  isImportant?: boolean;
}

interface Detail extends DoctorRow {
  internalNotes?: Note[];
}

interface Overview {
  today: string;
  now: string;
  businessHours: BusinessDay[];
  ahead: { date: string; booked: number }[] | null;
  activity: { days: { date: string; booked: number; seen: number; noShow: number }[]; visits: number; prescriptions: number; collected: number; billed: number } | null;
}

type Dialog = { kind: 'hours' } | { kind: 'time-off' } | { kind: 'remove-time-off'; key: string } | { kind: 'delete' } | { kind: 'delete-note'; note: Note } | null;

const ICONS = {
  ...ICON,
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  plus: 'M12 4v16m8-8H4',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
};

const longDay = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function DoctorDetailClient({ doctorId, permissions, saved }: { doctorId: string; permissions: DoctorPermissions; saved: 'created' | 'edited' | null }) {
  const router = useRouter();
  const { money } = useMoney();
  const res = useKeyedFetch<Detail>(`/api/doctors/${doctorId}`);
  const ov = useKeyedFetch<Overview>(`/api/doctors/${doctorId}/overview`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(saved === 'created' ? 'Doctor added. Set their usual hours below if you haven’t yet.' : saved === 'edited' ? 'Profile saved.' : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<{ forUrl: string; list: Note[] } | null>(null);
  const d = res.value;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const mine = permissions.myDoctorId === doctorId;
  const canEditHours = permissions.canEdit || mine;

  // --- Not loaded ---------------------------------------------------------------------

  if (!d && res.error) {
    const missing = /not found/i.test(res.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing ? ICONS.user : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Doctor not found' : 'This profile didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{missing ? 'It may have been deleted, or it belongs to another clinic.' : `${res.error}. Check your connection and try again.`}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/doctors" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All doctors
            </Link>
            {!missing && (
              <button type="button" onClick={res.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!d) {
    return (
      <Shell>
        <BackLink />
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-80 max-w-full rounded bg-gray-100" />
          </div>
          <div className="h-24 rounded-lg border border-gray-200 bg-white" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading the profile…
        </span>
      </Shell>
    );
  }

  // --- Loaded ---------------------------------------------------------------------------

  const name = doctorName(d);
  const st = statusOf(d);
  const spec = specialtyOf(d);
  const o = ov.value;
  const today = o?.today ?? null;
  const overrides = d.availabilityOverrides ?? [];
  const noteList = notes && notes.forUrl === res.valueUrl ? notes.list : (d.internalNotes ?? []);
  const subtitle = [spec || 'No specialty set', d.department && d.department !== 'No Department' ? d.department : null].filter(Boolean).join(' · ');

  const done = (message: string) => {
    setDialog(null);
    setNotice(message);
    setActionError(null);
    res.reload();
  };

  const remove = async () => {
    setDialog(null);
    setBusy(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/doctors/${doctorId}`, { method: 'DELETE' });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) {
        setActionError(formatApiError(json, 'The profile could not be deleted'));
        setBusy(false);
        return;
      }
      router.push('/doctors');
    } catch {
      setActionError('The server couldn’t be reached. Nothing changed; try again.');
      setBusy(false);
    }
  };

  const dropTimeOff = async (key: string) => {
    setDialog(null);
    setBusy(true);
    try {
      await removeTimeOff(doctorId, overrides, key);
      done('Time off removed.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The time off could not be removed');
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (note: Note) => {
    setDialog(null);
    setBusy(true);
    try {
      const r = await fetch(`/api/doctors/${doctorId}/notes?noteId=${note._id}`, { method: 'DELETE' });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error(formatApiError(json, 'The note could not be deleted'));
      setNotes({ forUrl: res.valueUrl ?? '', list: json.data?.internalNotes ?? [] });
      setNotice('Note deleted.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The note could not be deleted');
    } finally {
      setBusy(false);
    }
  };

  // Summary cells, each only for roles that may see it.
  const cells: ReactNode[] = [];
  if (today) cells.push(<TodayCell key="today" doctor={d} today={today} bookedToday={o?.ahead?.[0]?.booked ?? null} />);
  if (o?.ahead) cells.push(<AheadCell key="ahead" ahead={o.ahead} />);
  if (o?.activity) {
    const a = o.activity;
    const seen = a.days.reduce((s, x) => s + x.seen, 0);
    const noShow = a.days.reduce((s, x) => s + x.noShow, 0);
    const booked = a.days.reduce((s, x) => s + x.booked, 0);
    cells.push(
      <Cell key="seen" label="Seen, last 30 days">
        <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{seen}</p>
        <p className="mt-1 text-sm text-gray-500">
          of <span className="font-mono">{booked}</span> booked
          {noShow > 0 && (
            <>
              {' · '}
              <span className="font-mono">{noShow}</span> {noShow === 1 ? 'no-show' : 'no-shows'}
            </>
          )}
        </p>
      </Cell>,
      <Cell key="money" label="Collected, last 30 days">
        <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{money(a.collected)}</p>
        <p className="mt-1 text-sm text-gray-500">
          on <span className="font-mono">{a.visits}</span> {a.visits === 1 ? 'visit' : 'visits'}, <span className="font-mono">{a.prescriptions}</span> {a.prescriptions === 1 ? 'prescription' : 'prescriptions'}
        </p>
      </Cell>
    );
  }
  const stripCols = ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-2 lg:grid-cols-4'][cells.length];

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{name}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${DOCTOR_STATE[st].badge}`}>{DOCTOR_STATE[st].label}</span>
            {d.licenseNumber && <span className="font-mono text-sm text-gray-500">PRC {d.licenseNumber}</span>}
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            {subtitle}
            {mine && <span className="text-gray-500"> · your profile</span>}
          </p>
        </div>
        <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          {permissions.canSeeBookings && (
            <Link href={`/appointments?doctor=${d._id}`} className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.calendar} />
              Appointments
            </Link>
          )}
          {permissions.canBook && st === 'active' && (
            <Link
              href={`/appointments/new?doctorId=${d._id}`}
              className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors ${FOCUS_RING} ${permissions.canEdit ? 'border border-gray-300 bg-white text-gray-900 hover:border-gray-900' : 'bg-brand-teal-dark text-white hover:bg-brand-teal-deep'}`}
            >
              <Svg d={ICONS.plus} />
              Book
            </Link>
          )}
          {permissions.canEdit && (
            <Link href={`/doctors/${d._id}/edit`} className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.edit} />
              Edit profile
            </Link>
          )}
          {permissions.canDelete && (
            <button
              type="button"
              onClick={() => setDialog({ kind: 'delete' })}
              disabled={busy}
              aria-label={`Delete ${name}’s profile`}
              title="Delete profile"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.trash} />
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
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}

      {cells.length > 0 ? (
        <section aria-label="Summary" className={`overflow-hidden rounded-lg border border-gray-200 bg-white transition-opacity ${ov.loading || res.loading ? 'opacity-60' : ''}`}>
          <dl className={`grid -mr-px -mb-px grid-cols-1 ${stripCols}`}>{cells}</dl>
        </section>
      ) : ov.error ? (
        <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
          Today’s figures didn&apos;t load ({ov.error}).{' '}
          <button type="button" onClick={ov.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Try again
          </button>
        </p>
      ) : (
        <div className="h-24 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <WeeklyHoursPanel doctor={d} businessHours={o?.businessHours ?? []} today={today} onChange={canEditHours && st !== 'inactive' ? () => setDialog({ kind: 'hours' }) : undefined} />

          {st !== 'inactive' && (
            <TimeOffPanel
              overrides={overrides}
              doctor={d}
              today={today}
              ahead={o?.ahead ?? null}
              onAdd={canEditHours && today ? () => setDialog({ kind: 'time-off' }) : undefined}
              onRemove={canEditHours ? (key) => setDialog({ kind: 'remove-time-off', key }) : undefined}
            />
          )}

          {o?.activity && (
            <Panel id="doc-activity" title="Appointments, last 30 days" aside={<span className="text-sm text-gray-500">Seen against booked</span>}>
              <TrendChart
                days={o.activity.days}
                today={o.today}
                series={[
                  { key: 'seen', label: 'Seen', color: SERIES.teal, kind: 'column' },
                  { key: 'booked', label: 'Booked', color: SERIES.blue, kind: 'line' },
                ]}
                format={(v) => String(Math.round(v))}
                caption={`${name}: appointments booked and seen per day, last 30 days`}
              />
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="doc-contact" title="Contact">
            <dl className="divide-y divide-gray-100">
              <Field label="Email">
                <a href={`mailto:${d.email}`} className={`rounded break-all text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                  {d.email}
                </a>
              </Field>
              <Field label="Phone">
                {d.phone ? (
                  <a href={`tel:${d.phone.replace(/[^+0-9]/g, '')}`} className={`rounded font-mono text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {d.phone}
                  </a>
                ) : (
                  <span className="text-gray-500">None on file</span>
                )}
              </Field>
            </dl>
          </Panel>

          <Panel id="doc-creds" title="Licences and qualifications">
            <dl className="divide-y divide-gray-100">
              <Field label="PRC licence">
                <span className="font-mono">{d.licenseNumber || '—'}</span>
              </Field>
              <Field label="PTR">{d.ptr ? <span className="font-mono">{d.ptr}</span> : <span className="text-gray-500">None on file</span>}</Field>
              <Field label="Qualifications">
                {d.qualifications && d.qualifications.length > 0 ? (
                  <ul className="space-y-0.5">
                    {d.qualifications.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-gray-500">None on file</span>
                )}
              </Field>
            </dl>
            <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">The licence and PTR print on this doctor’s prescriptions and certificates.</p>
          </Panel>

          {d.bio && (
            <Panel id="doc-bio" title="About">
              <p className="max-w-prose whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-gray-700">{d.bio}</p>
            </Panel>
          )}

          {permissions.canEdit && (
            <NotesPanel
              doctorId={doctorId}
              notes={noteList}
              onSaved={(list) => {
                setNotes({ forUrl: res.valueUrl ?? '', list });
                setNotice('Note added.');
              }}
              onDelete={(note) => setDialog({ kind: 'delete-note', note })}
            />
          )}
        </aside>
      </div>

      {dialog?.kind === 'hours' && <HoursDialog doctorId={doctorId} name={name} schedule={d.schedule ?? []} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'time-off' && today && (
        <TimeOffDialog doctorId={doctorId} name={name} today={today} schedule={d.schedule ?? []} overrides={overrides} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'remove-time-off' &&
        createPortal(
          <AlertDialog open onOpenChange={(v) => !v && setDialog(null)} title={`Remove the time off on ${longDay(dialog.key)}?`} description="The doctor’s usual hours apply that day again, and they can be booked.">
            <button type="button" onClick={() => setDialog(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep it
            </button>
            <button type="button" onClick={() => dropTimeOff(dialog.key)} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              Remove time off
            </button>
          </AlertDialog>,
          document.body
        )}
      {dialog?.kind === 'delete-note' &&
        createPortal(
          <AlertDialog open onOpenChange={(v) => !v && setDialog(null)} title="Delete this note?" description="It is removed for everyone who manages doctors. This can’t be undone.">
            <button type="button" onClick={() => setDialog(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep note
            </button>
            <button type="button" onClick={() => deleteNote(dialog.note)} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
              Delete note
            </button>
          </AlertDialog>,
          document.body
        )}
      {dialog?.kind === 'delete' &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(v) => !v && setDialog(null)}
            title={`Delete ${name}’s profile?`}
            description={
              <>
                <p>
                  Only a profile with no appointments, visit notes or prescriptions can be deleted; one with records is refused, so their patients’ history keeps their name. {mine ? 'Your own login stays; it is only unlinked from this profile.' : 'Their doctor login is deleted too and they are signed out.'}
                </p>
                <p className="mt-2">To stop bookings and sign-ins but keep everything, edit the profile and mark them inactive instead.</p>
              </>
            }
          >
            <button type="button" onClick={() => setDialog(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep profile
            </button>
            <button type="button" onClick={remove} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
              Delete profile
            </button>
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Summary cells
// ---------------------------------------------------------------------------

function TodayCell({ doctor, today, bookedToday }: { doctor: DoctorRow; today: string; bookedToday: number | null }) {
  const h = dayHours(doctor, today);
  return (
    <Cell label="Today">
      {h.kind === 'working' ? (
        <>
          <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{hoursRange(h.start, h.end)}</p>
          <p className={`mt-1 text-sm ${h.changed ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
            {h.changed ? `Changed hours${h.reason ? `: ${h.reason}` : ''}` : 'Usual hours'}
            {bookedToday !== null && (
              <span className="font-normal text-gray-500">
                {' · '}
                <span className="font-mono">{bookedToday}</span> booked
              </span>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tracking-tight text-gray-500">{h.kind === 'leave' ? 'On leave' : h.kind === 'inactive' ? 'Inactive' : h.timeOff ? 'Time off' : 'Not working'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {h.kind === 'off' && h.timeOff ? h.reason || 'Away all day' : h.kind === 'off' ? `No usual hours on ${WEEKDAY_LONG[weekdayOf(today)]}s` : h.kind === 'leave' ? 'Not taking bookings' : 'Off the roster'}
            {bookedToday ? (
              <span className="font-medium text-amber-800">
                {' · '}
                <span className="font-mono">{bookedToday}</span> still booked
              </span>
            ) : null}
          </p>
        </>
      )}
    </Cell>
  );
}

function AheadCell({ ahead }: { ahead: { date: string; booked: number }[] }) {
  const total = ahead.reduce((s, x) => s + x.booked, 0);
  const max = Math.max(1, ...ahead.map((x) => x.booked));
  const busiest = ahead.reduce((b, x) => (x.booked > b.booked ? x : b), ahead[0]);
  return (
    <Cell label="Booked, next 14 days">
      <div className="flex items-end justify-between gap-4">
        <p className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{total}</p>
        <span aria-hidden="true" className="flex h-8 items-end gap-0.5">
          {ahead.map((x, i) => (
            <span
              key={x.date}
              className={`motion-col-grow w-1.5 rounded-t-sm ${x.booked ? '' : 'bg-gray-200'}`}
              style={{ height: x.booked ? `${Math.max(12, (x.booked / max) * 100)}%` : '3px', background: x.booked ? (i === 0 ? '#0A7F7E' : SERIES.teal) : undefined, animationDelay: `${Math.min(i * 15, 200)}ms` }}
            />
          ))}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        {total === 0 ? (
          'Nothing booked yet.'
        ) : (
          <>
            Busiest {longDay(busiest.date)}, <span className="font-mono">{busiest.booked}</span>
          </>
        )}
      </p>
    </Cell>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function WeeklyHoursPanel({ doctor, businessHours, today, onChange }: { doctor: DoctorRow; businessHours: BusinessDay[]; today: string | null; onChange?: () => void }) {
  const schedule = (doctor.schedule ?? []).filter((s) => s.isAvailable !== false);
  const closed = new Set(businessHours.filter((h) => h.closed).map((h) => h.day));
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of businessHours) {
    if (h.closed) continue;
    lo = Math.min(lo, toMin(h.open) ?? lo);
    hi = Math.max(hi, toMin(h.close) ?? hi);
  }
  for (const s of schedule) {
    lo = Math.min(lo, toMin(s.startTime) ?? lo);
    hi = Math.max(hi, toMin(s.endTime) ?? hi);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    lo = 8 * 60;
    hi = 17 * 60;
  }
  const todayWd = today ? weekdayOf(today) : null;
  const minutes = schedule.reduce((sum, s) => sum + Math.max(0, (toMin(s.endTime) ?? 0) - (toMin(s.startTime) ?? 0)), 0);

  return (
    <Panel
      id="doc-hours"
      title="Usual hours"
      aside={
        onChange ? (
          <button type="button" onClick={onChange} className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Change hours
          </button>
        ) : minutes > 0 ? (
          <span className="text-sm text-gray-500">
            <span className="font-mono text-gray-900">{Math.round((minutes / 60) * 10) / 10}</span> hours a week
          </span>
        ) : null
      }
    >
      {schedule.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No usual hours set.{onChange ? ' Set them so the roster and the front desk know when this doctor is in.' : ''}</p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {WEEK_ORDER.map((day, i) => {
              const s = schedule.find((x) => x.dayOfWeek === day);
              const isToday = todayWd === day;
              const a = s ? (toMin(s.startTime) ?? lo) : 0;
              const b = s ? (toMin(s.endTime) ?? hi) : 0;
              return (
                <li key={day} className={`grid grid-cols-[6.5rem_9.5rem_minmax(0,1fr)] items-center gap-4 px-5 py-2.5 text-sm ${isToday ? 'bg-brand-teal-light/25' : ''}`}>
                  <span className={isToday ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                    {WEEKDAY_LONG[day]}
                    {isToday && <span className="sr-only"> (today)</span>}
                  </span>
                  {s ? <span className="font-mono tabular-nums text-gray-900">{hoursRange(s.startTime, s.endTime)}</span> : <span className="text-gray-400">Not working</span>}
                  <span className="min-w-0">
                    {s && (
                      <span aria-hidden="true" className="block h-1.5 rounded-full bg-gray-100">
                        <span
                          className="motion-bar-grow block h-full rounded-full"
                          style={{ marginLeft: `${((a - lo) / (hi - lo)) * 100}%`, width: `${Math.max(3, ((b - a) / (hi - lo)) * 100)}%`, background: SERIES.teal, animationDelay: `${i * 40}ms` }}
                        />
                      </span>
                    )}
                    {s && closed.has(WEEKDAY_KEYS[day]) && <span className="mt-1 block text-xs font-medium text-amber-800">The clinic is closed on {WEEKDAY_LONG[day]}s in Settings</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-gray-100 px-5 py-2.5 font-mono text-xs text-gray-500">
            Bar scale: {hoursRange(`${String(Math.floor(lo / 60)).padStart(2, '0')}:${String(lo % 60).padStart(2, '0')}`, `${String(Math.floor(hi / 60)).padStart(2, '0')}:${String(hi % 60).padStart(2, '0')}`)}
            <span className="font-sans">, the clinic’s day</span>
          </p>
        </>
      )}
    </Panel>
  );
}

function TimeOffPanel({
  overrides,
  doctor,
  today,
  ahead,
  onAdd,
  onRemove,
}: {
  overrides: TimeOff[];
  doctor: DoctorRow;
  today: string | null;
  ahead: { date: string; booked: number }[] | null;
  onAdd?: () => void;
  onRemove?: (key: string) => void;
}) {
  const sorted = [...overrides].map((x) => ({ ...x, key: timeOffDate(x.date) })).sort((a, b) => a.key.localeCompare(b.key));
  const upcoming = today ? sorted.filter((x) => x.key >= today) : sorted;
  const earlier = sorted.length - upcoming.length;

  return (
    <Panel
      id="doc-timeoff"
      title="Time off and changed hours"
      aside={
        onAdd ? (
          <button type="button" onClick={onAdd} className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Add time off
          </button>
        ) : null
      }
    >
      {upcoming.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">
          Nothing coming up.
          {earlier > 0 && (
            <>
              {' '}
              <span className="font-mono">{earlier}</span> earlier {earlier === 1 ? 'day' : 'days'} on file.
            </>
          )}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {upcoming.map((x, i) => {
              const usual = (doctor.schedule ?? []).find((s) => s.dayOfWeek === weekdayOf(x.key) && s.isAvailable !== false);
              const booked = ahead?.find((a) => a.date === x.key)?.booked ?? 0;
              return (
                <li key={x.key} className="motion-row-in grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 px-5 py-3 text-sm" style={{ animationDelay: `${Math.min(i * 25, 240)}ms` }}>
                  <div className="min-w-0">
                    <p className="text-gray-900">
                      <span className="font-mono font-semibold">{longDay(x.key)}</span>
                      {x.key === today && <span className="ml-1.5 text-xs font-semibold text-brand-teal-dark">today</span>}
                    </p>
                    <p className="mt-0.5 text-gray-600">
                      {x.isAvailable && x.startTime && x.endTime ? (
                        <>
                          Working <span className="font-mono">{hoursRange(x.startTime, x.endTime)}</span>
                          {usual && (
                            <span className="text-gray-500">
                              {' '}
                              instead of <span className="font-mono">{hoursRange(usual.startTime, usual.endTime)}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        'Away all day'
                      )}
                      {x.reason && <span className="text-gray-500"> · {x.reason}</span>}
                    </p>
                    {!x.isAvailable && booked > 0 && (
                      <p className="mt-0.5 font-medium text-amber-800">
                        <span className="font-mono">{booked}</span> {booked === 1 ? 'appointment is' : 'appointments are'} still booked that day
                      </p>
                    )}
                  </div>
                  {onRemove && (
                    <button type="button" onClick={() => onRemove(x.key)} aria-label={`Remove the time off on ${longDay(x.key)}`} className={REMOVE_BUTTON}>
                      <Svg d={ICON.x} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {earlier > 0 && (
            <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">
              <span className="font-mono">{earlier}</span> earlier {earlier === 1 ? 'day' : 'days'} on file.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function NotesPanel({ doctorId, notes, onSaved, onDelete }: { doctorId: string; notes: Note[]; onSaved: (list: Note[]) => void; onDelete: (note: Note) => void }) {
  const ids = useId();
  const router = useRouter();
  const [text, setText] = useState('');
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newest = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/doctors/${doctorId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: text.trim(), isImportant: important }) });
      if (r.status === 401) {
        router.push('/login');
        return;
      }
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error(formatApiError(json, 'The note could not be added'));
      setText('');
      setImportant(false);
      onSaved(json.data?.internalNotes ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The note could not be added');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel id="doc-notes" title="Internal notes" aside={<span className="text-sm text-gray-500">Only for staff who manage doctors</span>}>
      {newest.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {newest.map((n) => (
            <li key={n._id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                {n.isImportant && (
                  <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-red-700">
                    <Svg d={ICON.alert} className="h-3.5 w-3.5" />
                    Important
                  </p>
                )}
                <p className="whitespace-pre-wrap text-gray-900">{n.note}</p>
                <p className="mt-0.5 text-gray-500">
                  {n.createdBy?.name ?? 'Someone'} · <span className="font-mono text-xs">{shortDate(n.createdAt)}</span>
                </p>
              </div>
              <button type="button" onClick={() => onDelete(n)} aria-label="Delete note" className={REMOVE_BUTTON}>
                <Svg d={ICON.x} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="space-y-2 border-t border-gray-100 px-5 py-4">
        <NoteArea id={`${ids}-note`} label="New note" rows={2} value={text} onChange={setText} placeholder="e.g. Covers for Dr. Santos on Saturdays" />
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
            Mark as important
          </label>
          <button type="submit" disabled={!text.trim() || busy} className={`rounded-md border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`}>
            {busy ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/doctors" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICON.chevL} />
      All doctors
    </Link>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-gray-200 px-5 py-4">
        <h2 id={id} className="text-base font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-r border-b border-gray-200 p-5">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}
