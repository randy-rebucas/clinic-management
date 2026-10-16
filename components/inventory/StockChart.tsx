'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { SERIES, TableTwin, TipRow, useTooltip } from '../dashboards/charts';
import { qty } from './shared';

const H = 168;
const AXIS = 26;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 14;

const dayFmt = (key: string, opts: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00`).toLocaleDateString('en-US', opts);

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/**
 * Stock at the end of each day, as a step line (stock changes in jumps, not slopes), against the
 * item's reorder level as a dashed rule. Days before the first recorded change are left blank
 * rather than guessed. One series, so no legend; the panel title names it.
 */
export default function StockChart({
  days,
  today,
  reorderLevel,
  unit,
}: {
  days: { date: string; quantity: number | null }[];
  today: string;
  reorderLevel: number;
  unit: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const tip = useTooltip();
  const id = useId();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const known = days.map((d) => d.quantity).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(1, reorderLevel * 1.25, ...known));
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const band = days.length ? plotW / days.length : 0;
  const x0 = (i: number) => PAD_L + band * i;
  const y = (v: number) => PAD_T + H - (v / max) * H;
  const base = PAD_T + H;
  const first = days.findIndex((d) => d.quantity !== null);

  // Step path: each day holds its level across its band; jumps happen at day boundaries.
  let path = '';
  if (first !== -1) {
    path = `M${x0(first).toFixed(1)},${y(days[first].quantity!).toFixed(1)}`;
    for (let i = first; i < days.length; i++) {
      const v = days[i].quantity!;
      if (i > first) path += ` V${y(v).toFixed(1)}`;
      path += ` H${x0(i + 1).toFixed(1)}`;
    }
  }
  const area = first !== -1 ? `${path} V${base} H${x0(first).toFixed(1)} Z` : '';
  const last = days[days.length - 1]?.quantity ?? null;
  const labelEvery = 15;

  const show = (i: number, svg: SVGSVGElement) => {
    setActive(i);
    const r = svg.getBoundingClientRect();
    const d = days[i];
    tip.showAt(
      r.left + x0(i) + band / 2,
      r.top + PAD_T,
      <div>
        <p className="mb-1 text-xs font-medium text-gray-500">
          {dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}
          {d.date === today ? ' · today' : ''}
        </p>
        {d.quantity === null ? (
          <p className="text-gray-500">Before the history starts</p>
        ) : (
          <TipRow color={SERIES.teal} kind="line" label={`On hand at day’s end`} value={`${qty(d.quantity)} ${unit}`} />
        )}
      </div>
    );
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!band) return;
    const r = e.currentTarget.getBoundingClientRect();
    show(Math.min(days.length - 1, Math.max(0, Math.floor((e.clientX - r.left - PAD_L) / band))), e.currentTarget);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const cur = active ?? days.length - 1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? days.length - 1 : Math.min(days.length - 1, Math.max(0, cur + (e.key === 'ArrowLeft' ? -1 : 1)));
    show(next, e.currentTarget);
  };
  const clear = () => {
    setActive(null);
    tip.hide();
  };

  return (
    <div>
      <div ref={wrap} className="px-2 pt-3 pb-1">
        {width > 0 && (
          <svg
            width={width}
            height={PAD_T + H + AXIS}
            role="img"
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={clear}
            onKeyDown={onKey}
            onBlur={clear}
            className="block touch-pan-y rounded outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
          >
            <title id={`${id}-t`}>Stock at the end of each day, last 60 days</title>
            <desc id={`${id}-d`}>
              {last !== null ? `${qty(last)} ${unit} on hand now. ` : ''}Reorder level {qty(reorderLevel)}. Use left and right arrow keys to read each day.
            </desc>

            {[0, max / 2, max].map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(t)} y2={y(t)} stroke="#E5E7EB" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 font-mono text-xs tabular-nums">
                  {qty(Math.round(t))}
                </text>
              </g>
            ))}

            {active !== null && <line x1={x0(active) + band / 2} x2={x0(active) + band / 2} y1={PAD_T} y2={base} stroke="#9CA3AF" strokeWidth={1} shapeRendering="crispEdges" />}

            {first !== -1 && (
              <g className="motion-line-in">
                <path d={area} fill={SERIES.teal} opacity={0.1} />
                <path d={path} fill="none" stroke={SERIES.teal} strokeWidth={2} strokeLinejoin="round" />
                {last !== null && <circle cx={x0(days.length) - 1} cy={y(last)} r={4} fill={SERIES.teal} stroke="#fff" strokeWidth={2} />}
              </g>
            )}

            {reorderLevel > 0 && (
              <g>
                <line x1={PAD_L} x2={width - PAD_R} y1={y(reorderLevel)} y2={y(reorderLevel)} stroke="#6B7280" strokeWidth={1} strokeDasharray="4 3" shapeRendering="crispEdges" />
                <text x={PAD_L + 4} y={y(reorderLevel) - 5} className="fill-gray-600 font-mono text-xs tabular-nums">
                  Reorder at {qty(reorderLevel)}
                </text>
              </g>
            )}

            {days.map((d, i) => {
              const isToday = d.date === today;
              if (!isToday && i % labelEvery !== 0) return null;
              return (
                <text key={d.date} x={x0(i) + band / 2} y={base + 18} textAnchor={isToday ? 'end' : 'middle'} className={`font-mono text-xs tabular-nums ${isToday ? 'fill-gray-900 font-semibold' : 'fill-gray-500'}`}>
                  {isToday ? 'Today' : dayFmt(d.date, { month: 'short', day: 'numeric' })}
                </text>
              );
            })}
          </svg>
        )}
      </div>
      <TableTwin
        caption="Stock at the end of each day, last 60 days"
        head={['Day', `On hand (${unit})`]}
        rows={days.filter((d) => d.quantity !== null).reverse().map((d) => [dayFmt(d.date, { weekday: 'short', month: 'short', day: 'numeric' }), qty(d.quantity!)])}
      />
      {tip.node}
    </div>
  );
}
