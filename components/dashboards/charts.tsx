'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Palette (validated with the dataviz palette checker, light + dark)
// ---------------------------------------------------------------------------

/** Two-series categorical pair: brand teal one step deeper for 3:1, and brand blue. */
export const SERIES = {
  teal: '#0E9594',
  blue: '#2563EB',
  /** Third categorical slot. Purple was rejected: it collapses into blue under deuteranopia. */
  ochre: '#B45309',
} as const;

/** Appointment state. Cancelled is deliberately outside the hue set: gray outline + strike + label. */
export const STATE = {
  upcoming: { fill: '#2563EB', ink: '#FFFFFF', label: 'Upcoming' },
  completed: { fill: '#0E9594', ink: '#0B2136', label: 'Seen' },
  pending: { fill: '#D97706', ink: '#0B2136', label: 'Pending' },
  noShow: { fill: '#BE123C', ink: '#FFFFFF', label: 'No-show' },
  cancelled: { fill: '#FFFFFF', ink: '#6B7280', label: 'Cancelled' },
} as const;
export type StateKey = keyof typeof STATE;

export function stateOf(status: string): StateKey {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'pending':
    case 'rescheduled':
      return 'pending';
    case 'no-show':
      return 'noShow';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'upcoming';
  }
}

const GRID = '#E5E7EB';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * pow >= value) return m * pow;
  }
  return 10 * pow;
}

export function toMinutes(hhmm: string | null | undefined) {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function clockLabel(minutes: number, withMinutes = true) {
  const h24 = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return withMinutes || mm ? `${h12}:${String(mm).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const dayFmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', opts);

// ---------------------------------------------------------------------------
// Tooltip: one fixed-position readout, so it is never clipped by a scroll box
// ---------------------------------------------------------------------------

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const hide = useCallback(() => setTip(null), []);
  const showAt = useCallback((x: number, y: number, content: ReactNode) => setTip({ x, y, content }), []);
  const showFor = useCallback((el: Element, content: ReactNode) => {
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, content });
  }, []);

  useEffect(() => {
    if (!tip) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [tip, hide]);

  const node =
    tip && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="presentation"
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full pb-2"
            style={{ left: tip.x, top: tip.y }}
          >
            <div className="rounded-md bg-white px-3 py-2 text-sm shadow-[0_8px_30px_rgb(15,23,42,0.14)] ring-1 ring-gray-200 min-w-[9rem]">
              {tip.content}
            </div>
          </div>,
          document.body
        )
      : null;

  return { showAt, showFor, hide, node };
}

export function TipRow({ color, kind, label, value }: { color: string; kind: 'line' | 'bar'; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-gray-600">
        <span
          aria-hidden="true"
          className={kind === 'line' ? 'h-0.5 w-3 rounded-full' : 'h-2.5 w-2.5 rounded-sm'}
          style={{ background: color }}
        />
        {label}
      </span>
      <span className="font-mono font-semibold text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend and table twin
// ---------------------------------------------------------------------------

export function Legend({ items }: { items: { label: string; color: string; kind: 'line' | 'bar' | 'outline' }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={
              item.kind === 'line'
                ? 'h-0.5 w-3.5 rounded-full'
                : item.kind === 'outline'
                  ? 'h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-gray-400'
                  : 'h-2.5 w-2.5 rounded-sm'
            }
            style={item.kind === 'outline' ? undefined : { background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function TableTwin({
  caption,
  head,
  rows,
  numeric,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
  /** Which columns hold figures (right-aligned, mono). Defaults to every column after the first. */
  numeric?: boolean[];
}) {
  const isNum = (c: number) => (numeric ? Boolean(numeric[c]) : c > 0);
  return (
    <details className="group border-t border-gray-100">
      <summary className="cursor-pointer select-none list-none px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
          </svg>
          View as table
        </span>
      </summary>
      <div className="max-h-72 overflow-auto px-5 pb-4">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-gray-500">
              {head.map((h, i) => (
                <th key={h} scope="col" className={`py-1.5 pr-3 font-medium ${isNum(i) ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} className={`py-1.5 pr-3 ${isNum(c) ? 'text-right font-mono tabular-nums text-gray-900' : 'text-gray-700'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// The clinic day: a live schedule board, one lane per doctor
// ---------------------------------------------------------------------------

export interface ScheduleItem {
  _id: string;
  time: string;
  duration: number;
  status: string;
  patient: string;
  doctorId: string | null;
  doctor: string;
}

export interface TodaySchedule {
  open: string | null;
  close: string | null;
  closedToday: boolean;
  /** Clinic-local "HH:mm" when the board shows today; null for any other day. */
  now: string | null;
  /** For a day other than today: true when it has already passed (the whole track is washed). */
  past?: boolean;
  appointments: ScheduleItem[];
}

const MAX_LANES = 8;
const ROW_H = 30;
const ROW_GAP = 4;
const LANE_PAD = 8;
const TRACK_MIN = 720;

interface Placed extends ScheduleItem {
  start: number;
  end: number;
  row: number;
}

function layoutLanes(items: ScheduleItem[], singleLane: string | null) {
  const groups = new Map<string, { label: string; items: ScheduleItem[] }>();
  for (const item of items) {
    const key = singleLane ? 'me' : item.doctorId ?? 'unassigned';
    const label = singleLane ?? (item.doctorId ? item.doctor : 'Unassigned');
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  let lanes = [...groups.entries()]
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
  if (lanes.length > MAX_LANES) {
    const keep = lanes.slice(0, MAX_LANES - 1);
    const rest = lanes.slice(MAX_LANES - 1);
    lanes = [...keep, { key: 'other', label: `${rest.length} other doctors`, items: rest.flatMap((l) => l.items) }];
  }

  return lanes.map((lane) => {
    const rowEnds: number[] = [];
    const placed: Placed[] = [];
    const sorted = lane.items
      .map((it) => {
        const start = toMinutes(it.time) ?? 0;
        return { ...it, start, end: start + Math.max(10, it.duration || 30) };
      })
      .sort((a, b) => a.start - b.start);
    for (const it of sorted) {
      let row = rowEnds.findIndex((end) => end <= it.start);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(it.end);
      } else rowEnds[row] = it.end;
      placed.push({ ...it, row });
    }
    const rows = Math.max(1, rowEnds.length);
    return { key: lane.key, label: lane.label, placed, height: LANE_PAD * 2 + rows * ROW_H + (rows - 1) * ROW_GAP };
  });
}

export function ClinicDay({
  schedule,
  singleLane = null,
  receivedAt,
  caption = "Today's appointments",
}: {
  schedule: TodaySchedule;
  /** Label for a one-lane board (a doctor's own day); otherwise lanes are per doctor. */
  singleLane?: string | null;
  /** Client timestamp when the schedule arrived, to keep the now-line moving. */
  receivedAt: number;
  /** Names the day in the table twin. */
  caption?: string;
}) {
  const tip = useTooltip();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const live = schedule.now !== null;
  const serverNow = toMinutes(schedule.now) ?? 0;
  const nowMin = serverNow + Math.floor((clock - receivedAt) / 60_000);

  const lanes = useMemo(() => layoutLanes(schedule.appointments, singleLane), [schedule.appointments, singleLane]);

  // Window: business hours, widened to fit every booking; 8–6 when hours are unknown.
  const { from, to } = useMemo(() => {
    const starts = schedule.appointments.map((a) => toMinutes(a.time)).filter((v): v is number => v !== null);
    const ends = schedule.appointments.map((a) => (toMinutes(a.time) ?? 0) + (a.duration || 30));
    let lo = toMinutes(schedule.open) ?? 8 * 60;
    let hi = toMinutes(schedule.close) ?? 18 * 60;
    if (starts.length) lo = Math.min(lo, ...starts);
    if (ends.length) hi = Math.max(hi, ...ends);
    lo = Math.floor(lo / 60) * 60;
    hi = Math.ceil(hi / 60) * 60;
    if (hi - lo < 4 * 60) hi = lo + 4 * 60;
    return { from: lo, to: hi };
  }, [schedule]);

  const span = to - from;
  const pct = (m: number) => ((m - from) / span) * 100;
  const nowPct = live ? Math.min(100, Math.max(0, pct(nowMin))) : schedule.past ? 100 : 0;
  const nowVisible = live && nowMin >= from && nowMin <= to;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = from; m <= to; m += 60) out.push(m);
    return out;
  }, [from, to]);

  // Bring "now" into view on narrow screens.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !live || el.scrollWidth <= el.clientWidth) return;
    const track = el.scrollWidth - 132;
    el.scrollLeft = Math.max(0, 132 + (track * nowPct) / 100 - el.clientWidth / 2);
    // Only on first paint of this schedule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  if (schedule.appointments.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm font-semibold text-gray-900">
          {schedule.closedToday ? 'The clinic is closed today' : 'Nothing booked today'}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {schedule.closedToday
            ? 'Business hours in Settings mark today as closed.'
            : 'Appointments booked for today will fill this board by doctor and time.'}
        </p>
      </div>
    );
  }

  const counts = schedule.appointments.reduce<Record<StateKey, number>>(
    (acc, a) => ({ ...acc, [stateOf(a.status)]: acc[stateOf(a.status)] + 1 }),
    { upcoming: 0, completed: 0, pending: 0, noShow: 0, cancelled: 0 }
  );

  return (
    <div>
      <div className="px-5 pt-3 pb-1">
        <Legend
          items={(Object.keys(STATE) as StateKey[])
            .filter((k) => counts[k] > 0)
            .map((k) => ({
              label: `${STATE[k].label} ${counts[k]}`,
              color: STATE[k].fill,
              kind: k === 'cancelled' ? ('outline' as const) : ('bar' as const),
            }))}
        />
      </div>

      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        <div className="relative" style={{ minWidth: TRACK_MIN + 132 }}>
          {/* Hour ruler */}
          <div className="flex h-8 items-end border-b border-gray-200">
            <div className="sticky left-0 z-20 w-[132px] shrink-0 self-stretch bg-white" />
            <div className="relative flex-1 self-stretch">
              {hours.map((m) => (
                <span
                  key={m}
                  className="absolute bottom-1.5 -translate-x-1/2 font-mono text-xs text-gray-500 tabular-nums first:translate-x-0"
                  style={{ left: `${pct(m)}%` }}
                >
                  {m === from ? <span className="pl-1">{clockLabel(m, false)}</span> : m === to ? null : clockLabel(m, false)}
                </span>
              ))}
            </div>
          </div>

          {/* Lanes */}
          <div className="relative">
            {/* Time layer: hour rules, elapsed wash, now-line. Spans the track column only. */}
            <div className="pointer-events-none absolute inset-y-0 right-0 left-[132px]" aria-hidden="true">
              {hours.map((m) => (
                <span key={m} className="absolute inset-y-0 w-px bg-gray-100" style={{ left: `${pct(m)}%` }} />
              ))}
              <div
                className="motion-cd-wash absolute inset-0 bg-gray-50"
                style={{ clipPath: `inset(0 ${100 - nowPct}% 0 0)` }}
              />
              {nowVisible && (
                <div
                  className="motion-cd-sweep absolute inset-0 transition-transform duration-700 ease-linear"
                  style={{ transform: `translateX(${nowPct}%)` }}
                >
                  <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-brand-teal-dark" />
                </div>
              )}
            </div>

            {lanes.map((lane) => (
              <div key={lane.key} className="relative flex border-b border-gray-100 last:border-b-0" style={{ height: lane.height }}>
                <div className="sticky left-0 z-20 flex w-[132px] shrink-0 items-center border-r border-gray-100 bg-white px-4">
                  <span className="truncate text-sm font-medium text-gray-700" title={lane.label}>
                    {lane.label}
                  </span>
                </div>
                <ul className="relative flex-1" aria-label={`${lane.label} appointments`}>
                  {lane.placed.map((a) => {
                    const st = STATE[stateOf(a.status)];
                    const left = pct(a.start);
                    const width = Math.max(0.6, pct(a.end) - left);
                    const approxPx = (width / 100) * TRACK_MIN;
                    const cancelled = stateOf(a.status) === 'cancelled';
                    const content = (
                      <div>
                        <p className="font-semibold text-gray-900">{a.patient}</p>
                        <p className="text-gray-500">
                          <span className="font-mono tabular-nums">
                            {clockLabel(a.start)}–{clockLabel(a.end)}
                          </span>
                          {!singleLane && <> · {a.doctor}</>}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-gray-700">
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-sm ${cancelled ? 'ring-1 ring-inset ring-gray-400' : ''}`}
                            style={cancelled ? undefined : { background: st.fill }}
                          />
                          {a.status.charAt(0).toUpperCase() + a.status.slice(1).replace(/-/g, ' ')}
                        </p>
                      </div>
                    );
                    return (
                      <li
                        key={a._id}
                        className="motion-cd-mark absolute"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          top: LANE_PAD + a.row * (ROW_H + ROW_GAP),
                          height: ROW_H,
                          animationDelay: `${Math.min(700, Math.max(0, left) * 7)}ms`,
                        }}
                      >
                        <Link
                          href={`/appointments/${a._id}`}
                          aria-label={`${a.patient}, ${clockLabel(a.start)}, ${a.status}${singleLane ? '' : `, ${a.doctor}`}`}
                          onPointerEnter={(e) => tip.showFor(e.currentTarget, content)}
                          onPointerLeave={tip.hide}
                          onFocus={(e) => tip.showFor(e.currentTarget, content)}
                          onBlur={tip.hide}
                          className={`flex h-full items-center overflow-hidden rounded px-1.5 text-xs font-semibold outline-none transition-[filter,box-shadow] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ${
                            cancelled ? 'ring-1 ring-inset ring-gray-300 line-through decoration-gray-400' : ''
                          }`}
                          style={{ background: st.fill, color: st.ink, marginRight: 2 }}
                        >
                          {approxPx >= 22 && <span className="truncate">{approxPx >= 84 ? a.patient : initials(a.patient)}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Now chip rides above the lanes, outside the clipped layer */}
          {nowVisible && (
            <div className="pointer-events-none absolute top-0 right-0 left-[132px] h-8" aria-hidden="true">
              <div
                className="motion-cd-sweep absolute inset-0 transition-transform duration-700 ease-linear"
                style={{ transform: `translateX(${nowPct}%)` }}
              >
                <span className="absolute top-1 left-0 -translate-x-1/2 rounded bg-brand-teal-dark px-1.5 py-0.5 font-mono text-xs font-semibold leading-none text-white tabular-nums">
                  {clockLabel(((nowMin % 1440) + 1440) % 1440)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <TableTwin
        caption={caption}
        head={['Time', 'Patient', ...(singleLane ? [] : ['Doctor']), 'Status']}
        numeric={[true, false, false, false]}
        rows={[...schedule.appointments]
          .sort((a, b) => (toMinutes(a.time) ?? 0) - (toMinutes(b.time) ?? 0))
          .map((a) => [
            clockLabel(toMinutes(a.time) ?? 0),
            a.patient,
            ...(singleLane ? [] : [a.doctor]),
            a.status.charAt(0).toUpperCase() + a.status.slice(1).replace(/-/g, ' '),
          ])}
      />
      <p className="sr-only" aria-live="polite">
        {nowVisible ? `Current time ${clockLabel(((nowMin % 1440) + 1440) % 1440)}.` : ''}
      </p>
      {tip.node}
    </div>
  );
}

/** "Open 9:00 AM – 5:00 PM · 14 booked" */
export function scheduleSubtitle(schedule: TodaySchedule) {
  const n = schedule.appointments.filter((a) => a.status !== 'cancelled').length;
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  const hours = schedule.closedToday
    ? 'Closed today'
    : open !== null && close !== null
      ? `Open ${clockLabel(open)} – ${clockLabel(close)}`
      : 'Business hours not set';
  return `${hours} · ${n} booked`;
}

/** Label for the trend window the API returns for each period. */
export function trendWindowLabel(period: string) {
  return period === 'week' ? 'This week, day by day' : period === 'month' ? 'This month, day by day' : 'Last 14 days';
}

// ---------------------------------------------------------------------------
// Trend chart: columns and/or lines on one shared axis, with a crosshair
// ---------------------------------------------------------------------------

export interface TrendDay {
  date: string;
  [key: string]: number | string;
}

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  kind: 'column' | 'line' | 'area';
}

const PLOT_H = 200;
const AXIS_H = 28;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 12;

export function TrendChart({
  days,
  today,
  series,
  format,
  formatTick,
  caption,
}: {
  days: TrendDay[];
  today: string;
  series: TrendSeries[];
  format: (v: number) => string;
  formatTick?: (v: number) => string;
  caption: string;
}) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const tip = useTooltip();
  const [active, setActive] = useState<number | null>(null);
  const id = useId();

  const todayIdx = days.findIndex((d) => d.date === today);
  const lastIdx = todayIdx === -1 ? days.length - 1 : todayIdx;
  const max = niceMax(Math.max(1, ...days.slice(0, lastIdx + 1).flatMap((d) => series.map((s) => Number(d[s.key]) || 0))));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];

  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const band = days.length ? plotW / days.length : 0;
  const cx = (i: number) => PAD_L + band * i + band / 2;
  const y = (v: number) => PAD_T + PLOT_H - (v / max) * PLOT_H;
  const baseline = PAD_T + PLOT_H;
  const colW = Math.max(2, Math.min(24, band * 0.56));
  const labelEvery = days.length <= 14 ? 1 : days.length <= 21 ? 2 : 5;

  const columns = series.filter((s) => s.kind === 'column');
  const lines = series.filter((s) => s.kind !== 'column');

  const pathFor = (key: string) =>
    days
      .slice(0, lastIdx + 1)
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(Number(d[key]) || 0).toFixed(1)}`)
      .join(' ');

  const showIndex = (i: number, svg: SVGSVGElement) => {
    setActive(i);
    const r = svg.getBoundingClientRect();
    const d = days[i];
    const future = i > lastIdx;
    tip.showAt(
      r.left + cx(i),
      r.top + PAD_T,
      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">
          {dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}
          {d.date === today ? ' · today' : ''}
        </p>
        {future ? (
          <p className="text-gray-500">Still ahead</p>
        ) : (
          series.map((s) => (
            <TipRow key={s.key} color={s.color} kind={s.kind === 'column' ? 'bar' : 'line'} label={s.label} value={format(Number(d[s.key]) || 0)} />
          ))
        )}
      </div>
    );
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!band) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(days.length - 1, Math.max(0, Math.floor((e.clientX - r.left - PAD_L) / band)));
    showIndex(i, e.currentTarget);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cur = active ?? lastIdx;
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? days.length - 1 : Math.min(days.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
    showIndex(next, e.currentTarget);
  };

  const clear = () => {
    setActive(null);
    tip.hide();
  };

  const lastValues = series.map((s) => ({ s, v: Number(days[lastIdx]?.[s.key]) || 0 }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
        <Legend items={series.map((s) => ({ label: s.label, color: s.color, kind: s.kind === 'column' ? 'bar' : 'line' }))} />
      </div>
      <div ref={wrapRef} className="px-2 pt-2 pb-1">
        {width > 0 && (
          <svg
            width={width}
            height={PAD_T + PLOT_H + AXIS_H}
            role="img"
            aria-labelledby={`${id}-cap`}
            aria-describedby={`${id}-desc`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={clear}
            onKeyDown={onKey}
            onBlur={clear}
            className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 rounded"
          >
            <title id={`${id}-cap`}>{caption}</title>
            <desc id={`${id}-desc`}>
              {lastValues.map(({ s, v }) => `${s.label}: ${format(v)} on the latest day.`).join(' ')} Use left and right arrow keys to read each day.
            </desc>

            {/* Grid + y ticks */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 font-mono text-xs tabular-nums">
                  {(formatTick ?? format)(t)}
                </text>
              </g>
            ))}

            {/* Days still ahead: a quiet slot so the period's remaining length reads */}
            {days.map((d, i) =>
              i > lastIdx ? (
                <rect key={`f-${d.date}`} x={cx(i) - colW / 2} y={baseline - 3} width={colW} height={3} rx={1.5} fill="#E5E7EB" />
              ) : null
            )}

            {/* Crosshair */}
            {active !== null && (
              <line x1={cx(active)} x2={cx(active)} y1={PAD_T} y2={baseline} stroke="#9CA3AF" strokeWidth={1} shapeRendering="crispEdges" />
            )}

            {/* Columns */}
            {columns.map((s, si) => {
              const w = columns.length > 1 ? colW / columns.length - 1 : colW;
              return days.slice(0, lastIdx + 1).map((d, i) => {
                const v = Number(d[s.key]) || 0;
                if (v <= 0) return null;
                const x = cx(i) - colW / 2 + si * (w + 2);
                const top = y(v);
                const h = baseline - top;
                const r = Math.min(4, w / 2, h);
                return (
                  <path
                    key={`${s.key}-${d.date}`}
                    className="motion-col-grow"
                    style={{ animationDelay: `${Math.min(240, i * 12)}ms` }}
                    d={`M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${baseline} Z`}
                    fill={s.color}
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                );
              });
            })}

            {/* Lines / areas */}
            {lines.map((s) => {
              const d = pathFor(s.key);
              return (
                <g key={s.key} className="motion-line-in">
                  {s.kind === 'area' && lastIdx > 0 && (
                    <path d={`${d} L${cx(lastIdx)},${baseline} L${cx(0)},${baseline} Z`} fill={s.color} opacity={0.1} />
                  )}
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {/* End dot with surface ring */}
                  {lastIdx >= 0 && (
                    <circle cx={cx(lastIdx)} cy={y(Number(days[lastIdx][s.key]) || 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                  )}
                  {active !== null && active <= lastIdx && (
                    <circle cx={cx(active)} cy={y(Number(days[active][s.key]) || 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                  )}
                </g>
              );
            })}

            {/* X labels */}
            {days.map((d, i) => {
              const isToday = d.date === today;
              if (!isToday && i % labelEvery !== 0) return null;
              return (
                <text
                  key={`x-${d.date}`}
                  x={cx(i)}
                  y={baseline + 18}
                  textAnchor="middle"
                  className={`font-mono text-xs tabular-nums ${isToday ? 'fill-gray-900 font-semibold' : 'fill-gray-500'}`}
                >
                  {days.length <= 7 ? dayFmt(d.date, { weekday: 'short' }) : dayFmt(d.date, { day: 'numeric' })}
                </text>
              );
            })}
            {todayIdx !== -1 && (
              <rect x={cx(todayIdx) - 8} y={baseline + 24} width={16} height={2} rx={1} fill="#0A7F7E" />
            )}
          </svg>
        )}
      </div>
      <TableTwin
        caption={caption}
        head={['Day', ...series.map((s) => s.label)]}
        rows={days.slice(0, lastIdx + 1).map((d) => [
          dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }),
          ...series.map((s) => format(Number(d[s.key]) || 0)),
        ])}
      />
      {tip.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status mix: one proportional bar, legend carries labels and counts
// ---------------------------------------------------------------------------

export function StatusMix({ mix }: { mix: Record<string, number> }) {
  const tip = useTooltip();
  const groups = (Object.keys(STATE) as StateKey[])
    .map((k) => ({
      k,
      v: Object.entries(mix)
        .filter(([status]) => stateOf(status) === k)
        .reduce((sum, [, n]) => sum + n, 0),
    }))
    .filter((g) => g.v > 0);
  const total = groups.reduce((s, g) => s + g.v, 0);

  if (total === 0) {
    return <p className="px-5 py-10 text-center text-sm text-gray-500">No appointments in this period yet.</p>;
  }

  return (
    <div className="px-5 py-5">
      <p className="text-sm text-gray-600">
        <span className="font-mono text-2xl font-semibold text-gray-900">{total}</span> appointments
      </p>
      <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" role="img" aria-label={groups.map((g) => `${STATE[g.k].label} ${g.v}`).join(', ')}>
        {groups.map((g, i) => {
          const content = (
            <TipRow color={g.k === 'cancelled' ? '#9CA3AF' : STATE[g.k].fill} kind="bar" label={STATE[g.k].label} value={`${g.v} · ${Math.round((g.v / total) * 100)}%`} />
          );
          return (
            <span
              key={g.k}
              className={`motion-seg-grow h-full ${g.k === 'cancelled' ? 'ring-1 ring-inset ring-gray-300' : ''}`}
              style={{
                flexGrow: g.v,
                flexBasis: 0,
                background: g.k === 'cancelled' ? '#F3F4F6' : STATE[g.k].fill,
                animationDelay: `${i * 60}ms`,
              }}
              onPointerEnter={(e) => tip.showFor(e.currentTarget, content)}
              onPointerLeave={tip.hide}
            />
          );
        })}
      </div>
      <dl className="mt-4 divide-y divide-gray-100">
        {groups.map((g) => (
          <div key={g.k} className="flex items-center justify-between py-2 text-sm">
            <dt className="flex items-center gap-2 text-gray-700">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-sm ${g.k === 'cancelled' ? 'ring-1 ring-inset ring-gray-400' : ''}`}
                style={g.k === 'cancelled' ? undefined : { background: STATE[g.k].fill }}
              />
              {STATE[g.k].label}
            </dt>
            <dd className="font-mono tabular-nums text-gray-900">
              {g.v}
              <span className="ml-2 inline-block w-10 text-right text-gray-500">{Math.round((g.v / total) * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
      {tip.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked bars (payment methods): one series, value at the tip
// ---------------------------------------------------------------------------

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  'credit-card': 'Credit card',
  'debit-card': 'Debit card',
  gcash: 'GCash',
  maya: 'Maya',
  paymaya: 'Maya',
  'bank-transfer': 'Bank transfer',
  bank_transfer: 'Bank transfer',
  check: 'Check',
  hmo: 'HMO',
  insurance: 'Insurance',
  unknown: 'Not recorded',
};

export function RankedBars({
  values,
  format,
  empty = 'No payments recorded in this period.',
  label,
}: {
  values: Record<string, number>;
  format: (v: number) => string;
  /** Shown when every value is zero. */
  empty?: string;
  /** Row label; defaults to payment-method names. */
  label?: (key: string) => string;
}) {
  const rows = Object.entries(values)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const max = rows[0]?.[1] ?? 0;

  if (rows.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-gray-500">{empty}</p>;
  }

  return (
    <ul className="px-5 py-4 space-y-3.5">
      {rows.map(([method, v], i) => (
        <li key={method}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-gray-700">{label ? label(method) : METHOD_LABEL[method] ?? method.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}</span>
            <span className="font-mono tabular-nums text-gray-900">
              {format(v)}
              <span className="ml-2 inline-block w-10 text-right text-gray-500">{Math.round((v / total) * 100)}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-r bg-gray-100">
            <div
              className="motion-bar-grow h-full rounded-r"
              style={{ width: `${(v / max) * 100}%`, background: SERIES.teal, animationDelay: `${i * 50}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
