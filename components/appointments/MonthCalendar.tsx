'use client';

import { useRef, type KeyboardEvent } from 'react';
import { SERIES, TableTwin, TipRow, useTooltip } from '../dashboards/charts';
import { FOCUS_RING, ICON, Svg, dayLabel, keyToDate, localKey, shiftDay } from './shared';

export interface DayLoad {
  date: string;
  booked: number;
  walkIns: number;
  cancelled: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function monthOf(key: string) {
  return key.slice(0, 7);
}

export function shiftMonth(month: string, by: number) {
  const d = new Date(`${month}-15T12:00:00`);
  d.setMonth(d.getMonth() + by);
  return localKey(d).slice(0, 7);
}

/**
 * The month as a load map: each day carries a bar as long as its bookings, relative to the
 * busiest day of the month. Picking a day drives the schedule beside it.
 */
export default function MonthCalendar({
  month,
  days,
  today,
  selected,
  closedWeekdays,
  refreshing,
  onSelect,
  onMonth,
}: {
  month: string;
  days: DayLoad[] | null;
  today: string;
  selected: string;
  closedWeekdays: Set<string>;
  refreshing: boolean;
  onSelect: (key: string) => void;
  onMonth: (month: string) => void;
}) {
  const tip = useTooltip();
  const gridRef = useRef<HTMLDivElement>(null);

  const first = new Date(`${month}-01T12:00:00`);
  const lead = first.getDay();
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const keys = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const byDate = new Map((days ?? []).map((d) => [d.date, d]));
  const max = Math.max(1, ...(days ?? []).map((d) => d.booked));
  const busiest = (days ?? []).reduce<DayLoad | null>((best, d) => (!best || d.booked > best.booked ? d : best), null);
  const total = (days ?? []).reduce((s, d) => s + d.booked, 0);
  const focusKey = monthOf(selected) === month ? selected : monthOf(today) === month ? today : keys[0];

  const focusDay = (key: string) => {
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in step) next = shiftDay(key, step[e.key]);
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      const d = keyToDate(key);
      d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1));
      next = localKey(d);
    } else if (e.key === 'Home') next = `${month}-01`;
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    if (monthOf(next) !== month) onMonth(monthOf(next));
    focusDay(next);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="month-title">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <h2 id="month-title" className="text-base font-bold tracking-tight text-gray-900" aria-live="polite">
            {first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {days ? (
              <>
                <span className="font-mono text-gray-700">{total.toLocaleString('en-US')}</span> booked this month
              </>
            ) : (
              'Counting bookings…'
            )}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            <Svg d={ICON.chevL} />
          </button>
          <button
            type="button"
            onClick={() => onMonth(shiftMonth(month, 1))}
            aria-label="Next month"
            className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            <Svg d={ICON.chevR} />
          </button>
        </div>
      </div>

      <div className="px-3 pt-3 pb-4">
        <div className="grid grid-cols-7 pb-1" aria-hidden="true">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1 text-center text-xs font-medium text-gray-500">
              {d}
            </span>
          ))}
        </div>
        <div
          ref={gridRef}
          role="group"
          aria-label="Choose a day. Arrow keys move between days, Page Up and Page Down change month."
          className={`grid grid-cols-7 gap-1 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}
        >
          {Array.from({ length: lead }).map((_, i) => (
            <span key={`lead-${i}`} aria-hidden="true" />
          ))}
          {keys.map((key, i) => {
            const load = byDate.get(key);
            const booked = load?.booked ?? 0;
            const isSel = key === selected;
            const isToday = key === today;
            const past = key < today;
            const closed = closedWeekdays.has(WEEKDAY_NAMES[(lead + i) % 7]);
            const summary = `${booked} booked${load?.walkIns ? `, ${load.walkIns} walk-in${load.walkIns === 1 ? '' : 's'}` : ''}${load?.cancelled ? `, ${load.cancelled} cancelled` : ''}`;
            const tipContent = (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500">
                  {dayLabel(key, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {isToday ? ' · today' : closed ? ' · closed' : ''}
                </p>
                <TipRow color={SERIES.teal} kind="bar" label="Booked" value={booked} />
                {load?.walkIns ? <TipRow color="#9CA3AF" kind="bar" label="of which walk-ins" value={load.walkIns} /> : null}
                {load?.cancelled ? <TipRow color="#E5E7EB" kind="bar" label="Cancelled" value={load.cancelled} /> : null}
              </div>
            );
            return (
              <button
                key={key}
                type="button"
                data-day={key}
                tabIndex={key === focusKey ? 0 : -1}
                aria-pressed={isSel}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${dayLabel(key, { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}${closed ? ', clinic closed' : ''}: ${summary}`}
                onClick={() => onSelect(key)}
                onKeyDown={(e) => onKey(e, key)}
                onPointerEnter={(e) => tip.showFor(e.currentTarget, tipContent)}
                onPointerLeave={tip.hide}
                onFocus={(e) => tip.showFor(e.currentTarget, tipContent)}
                onBlur={tip.hide}
                className={`relative flex h-14 flex-col items-center justify-start gap-0.5 rounded-md pt-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1 ${
                  isSel
                    ? 'bg-brand-teal-dark text-white'
                    : `${closed ? 'bg-gray-50' : ''} hover:bg-brand-teal-light/50 ${isToday ? 'ring-1 ring-inset ring-brand-teal-dark' : ''}`
                }`}
              >
                <span
                  className={`text-sm leading-none ${
                    isSel ? 'font-bold' : isToday ? 'font-bold text-brand-teal-deep' : past ? 'font-medium text-gray-500' : 'font-semibold text-gray-900'
                  }`}
                >
                  {i + 1}
                </span>
                {booked > 0 && (
                  <span className={`font-mono text-xs leading-none tabular-nums ${isSel ? 'text-white/85' : 'text-gray-500'}`}>{booked}</span>
                )}
                {days && (
                  <span className={`absolute inset-x-1.5 bottom-1.5 h-[3px] rounded-full ${isSel ? 'bg-white/25' : 'bg-gray-100'}`} aria-hidden="true">
                    {booked > 0 && (
                      <span
                        key={month}
                        className="motion-bar-grow block h-full rounded-full"
                        style={{
                          width: `${Math.max(12, (booked / max) * 100)}%`,
                          background: isSel ? 'rgba(255,255,255,0.9)' : SERIES.teal,
                          animationDelay: `${Math.min(240, i * 8)}ms`,
                        }}
                      />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {busiest && busiest.booked > 0 && (
          <p className="mt-3 px-1 text-xs text-gray-500">
            Bars compare each day with the busiest,{' '}
            <span className="text-gray-700">{dayLabel(busiest.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span> (
            <span className="font-mono">{busiest.booked}</span>).
          </p>
        )}
      </div>

      {days && days.length > 0 && (
        <TableTwin
          caption={`Bookings per day, ${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
          head={['Day', 'Booked', 'Walk-ins', 'Cancelled']}
          rows={days.map((d) => [dayLabel(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), d.booked, d.walkIns, d.cancelled])}
        />
      )}
      {tip.node}
    </section>
  );
}
