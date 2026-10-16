'use client';

import Link from 'next/link';
import { FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import { doctorName } from './shared';
import {
  WEEKDAY_KEYS,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  addDays,
  dayHours,
  hoursRange,
  toMin,
  weekdayOf,
  type BusinessDay,
  type DayHours,
  type TimeOff,
  type WeeklyHours,
} from '@/lib/doctors';

export interface RosterDoctor {
  _id: string;
  firstName: string;
  lastName: string;
  title?: string;
  status: 'active' | 'on-leave';
  specialty: string | null;
  schedule: WeeklyHours[];
  availabilityOverrides: TimeOff[];
}

export interface Roster {
  today: string;
  now: string;
  days: string[];
  businessHours: BusinessDay[];
  /** Per doctor, per day; null when the viewer may not read appointments. */
  bookings: Record<string, Record<string, { booked: number; seen: number }>> | null;
  doctors: RosterDoctor[];
}

const dayNum = (key: string) => Number(key.slice(8, 10));
const monthShort = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

export function weekLabel(days: string[]) {
  const a = days[0];
  const b = days[days.length - 1];
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${monthShort(a)} ${dayNum(a)} – ${sameMonth ? '' : `${monthShort(b)} `}${dayNum(b)}`;
}

/** The clinic's day span across the week, widened to fit any shift, so every bar shares one scale. */
function weekSpan(roster: Roster) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of roster.businessHours) {
    if (h.closed) continue;
    const a = toMin(h.open);
    const b = toMin(h.close);
    if (a !== null) lo = Math.min(lo, a);
    if (b !== null) hi = Math.max(hi, b);
  }
  for (const d of roster.doctors) {
    for (const key of roster.days) {
      const h = dayHours(d, key);
      if (h.kind !== 'working') continue;
      lo = Math.min(lo, toMin(h.start) ?? lo);
      hi = Math.max(hi, toMin(h.end) ?? hi);
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return { lo: 8 * 60, hi: 17 * 60 };
  return { lo, hi };
}

/**
 * One clinic week as a roster: a row per doctor, a column per day. Each working day shows the
 * hours in words over a shift bar drawn on one shared scale (the clinic's opening hours, widened
 * to fit any shift), so a short day or a late start reads at a glance; time off and changed hours
 * say so in words, and bookings are counted under the hours. Past days are washed like the clinic
 * day; today's column carries the teal mark.
 */
export default function WeekBoard({
  roster,
  dimmed,
  onWeek,
}: {
  roster: Roster;
  dimmed: boolean;
  onWeek: (key: string | null) => void;
}) {
  const { days, today } = roster;
  const span = weekSpan(roster);
  const closed = new Set(roster.businessHours.filter((h) => h.closed).map((h) => h.day));
  const isThisWeek = days.includes(today);
  const working = roster.doctors.filter((d) => d.status === 'active');
  const onLeave = roster.doctors.length - working.length;

  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby="week-h">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="week-h" className="text-base font-bold tracking-tight text-gray-900">
            {isThisWeek ? 'This week' : 'Week of'} <span className="font-mono font-semibold">{weekLabel(days)}</span>
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Weekly hours with this week’s time off.{roster.bookings ? ' Bookings leave out cancelled ones.' : ''}
            {onLeave > 0 && ` ${onLeave} on leave.`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onWeek(addDays(days[0], -7))} aria-label="Previous week" className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
            <Svg d={ICON.chevL} />
          </button>
          <button
            type="button"
            onClick={() => onWeek(null)}
            disabled={isThisWeek}
            className={`rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:border-gray-200 disabled:text-gray-400 ${FOCUS_RING}`}
          >
            This week
          </button>
          <button type="button" onClick={() => onWeek(addDays(days[0], 7))} aria-label="Next week" className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
            <Svg d={ICON.chevR} />
          </button>
        </div>
      </div>

      {roster.doctors.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">No active doctors. Doctors marked inactive aren’t on the roster.</p>
      ) : (
        <div className={`overflow-x-auto transition-opacity duration-200 ${dimmed ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <caption className="sr-only">
              Doctors’ hours for the week of {weekLabel(days)}
              {roster.bookings ? ', with bookings per day' : ''}
            </caption>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <th scope="col" className="sticky left-0 z-10 w-56 bg-gray-50 px-4 py-2.5 text-left font-medium text-gray-500">
                  Doctor
                </th>
                {days.map((key) => {
                  const wd = weekdayOf(key);
                  const isToday = key === today;
                  const isClosed = closed.has(WEEKDAY_KEYS[wd]);
                  return (
                    <th key={key} scope="col" className={`px-3 py-2.5 text-left font-medium ${isToday ? 'text-gray-900' : 'text-gray-500'}`}>
                      <span className="sr-only">{WEEKDAY_LONG[wd]} </span>
                      <span aria-hidden="true">{WEEKDAY_SHORT[wd]}</span> <span className="font-mono">{dayNum(key)}</span>
                      {isToday && <span className="ml-1.5 text-xs font-semibold text-brand-teal-dark">today</span>}
                      {isToday && <span aria-hidden="true" className="mt-1 block h-0.5 w-6 rounded-full bg-brand-teal-dark" />}
                      {isClosed && <span className="block text-xs font-normal text-gray-400">Clinic closed</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.doctors.map((d, i) => (
                <tr key={d._id} className="motion-row-in group" style={{ animationDelay: `${Math.min(i * 25, 240)}ms` }}>
                  <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left align-top font-normal group-hover:bg-gray-50">
                    <Link href={`/doctors/${d._id}`} className={`block truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
                      {doctorName(d)}
                    </Link>
                    <span className="block truncate text-xs text-gray-500">{d.specialty || 'No specialty set'}</span>
                  </th>
                  {d.status === 'on-leave' ? (
                    <td colSpan={7} className="bg-gray-50/70 px-3 py-3 align-middle">
                      <span className="text-sm font-medium text-amber-800">On leave</span>
                      <span className="text-sm text-gray-500"> · not taking bookings until they’re marked active again</span>
                    </td>
                  ) : (
                    days.map((key) => (
                      <DayCell
                        key={key}
                        hours={dayHours(d, key)}
                        when={key < today ? 'past' : key === today ? 'today' : 'future'}
                        counts={roster.bookings ? (roster.bookings[d._id]?.[key] ?? { booked: 0, seen: 0 }) : null}
                        span={span}
                        clinicClosed={closed.has(WEEKDAY_KEYS[weekdayOf(key)])}
                      />
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DayCell({
  hours,
  when,
  counts,
  span,
  clinicClosed,
}: {
  hours: DayHours;
  when: 'past' | 'today' | 'future';
  counts: { booked: number; seen: number } | null;
  span: { lo: number; hi: number };
  clinicClosed: boolean;
}) {
  const wash = when === 'past' ? 'bg-gray-50/70' : when === 'today' ? 'bg-brand-teal-light/25' : '';
  const bookedLine =
    counts && counts.booked > 0 ? (
      <span className="mt-1 block text-xs text-gray-600">
        {when === 'past' ? (
          <>
            <span className="font-mono text-gray-900">{counts.seen}</span> seen of <span className="font-mono">{counts.booked}</span>
          </>
        ) : (
          <>
            <span className="font-mono text-gray-900">{counts.booked}</span> booked
          </>
        )}
      </span>
    ) : null;

  if (hours.kind === 'working') {
    const a = toMin(hours.start) ?? span.lo;
    const b = toMin(hours.end) ?? span.hi;
    const left = ((a - span.lo) / (span.hi - span.lo)) * 100;
    const width = Math.max(4, ((b - a) / (span.hi - span.lo)) * 100);
    return (
      <td className={`px-3 py-3 align-top ${wash}`}>
        <span className="block whitespace-nowrap font-mono text-xs tabular-nums text-gray-900">{hoursRange(hours.start, hours.end)}</span>
        <span aria-hidden="true" className="mt-1.5 block h-1.5 rounded-full bg-gray-100">
          <span className="motion-bar-grow block h-full rounded-full" style={{ marginLeft: `${left}%`, width: `${width}%`, background: SERIES.teal }} />
        </span>
        {hours.changed && (
          <span className="mt-1 block truncate text-xs font-medium text-amber-800" title={hours.reason}>
            Changed{hours.reason ? `: ${hours.reason}` : ' this day'}
          </span>
        )}
        {clinicClosed && !hours.changed && <span className="mt-1 block text-xs text-gray-500">Clinic closed</span>}
        {bookedLine}
      </td>
    );
  }

  if (hours.kind === 'off' && hours.timeOff) {
    return (
      <td className={`px-3 py-3 align-top ${wash}`}>
        <span className="block text-xs font-medium text-gray-700">Time off</span>
        {hours.reason && <span className="block truncate text-xs text-gray-500" title={hours.reason}>{hours.reason}</span>}
        {counts && counts.booked > 0 && (
          <span className="mt-1 block text-xs font-medium text-amber-800">
            <span className="font-mono">{counts.booked}</span> still booked
          </span>
        )}
      </td>
    );
  }

  return (
    <td className={`px-3 py-3 align-top ${wash}`}>
      <span aria-hidden="true" className="text-gray-300">
        —
      </span>
      <span className="sr-only">Not working</span>
      {counts && counts.booked > 0 && (
        <span className="mt-1 block text-xs text-gray-600">
          <span className="font-mono text-gray-900">{counts.booked}</span> booked outside hours
        </span>
      )}
    </td>
  );
}
