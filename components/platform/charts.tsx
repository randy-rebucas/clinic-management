'use client';

import { useEffect, useRef, useState } from 'react';

/** Charts for the platform console. One hue (brand-teal-dark, 4.6:1 on white), light theme only, like the console. */

export type ChartFormat = { kind: 'money'; currency: string } | { kind: 'count'; unit: [string, string] };

const BAR = '#0a7f7e';
const BAR_HOVER = '#086362';

function fmt(v: number, f: ChartFormat): string {
  if (f.kind === 'money') return v.toLocaleString('en-US', { style: 'currency', currency: f.currency, maximumFractionDigits: 0 });
  return `${v.toLocaleString('en-US')} ${v === 1 ? f.unit[0] : f.unit[1]}`;
}

/** Axis ticks: compact ("₱12k", "40"). */
function tick(v: number, f: ChartFormat): string {
  const n = v.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  if (f.kind !== 'money') return n;
  const sym = (0).toLocaleString('en-US', { style: 'currency', currency: f.currency, maximumFractionDigits: 0 }).replace(/[\d\s.,]/g, '');
  return `${sym}${n}`;
}

/** A "nice" axis maximum and 3–5 evenly spaced ticks from 0. */
function niceTicks(max: number, integer: boolean): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

/**
 * Vertical columns over time with a recessive grid, hover/focus tooltips and the latest column
 * labelled. `points` oldest first.
 */
export function ColumnChart({
  points,
  format,
  label,
  height = 180,
}: {
  points: Array<{ label: string; full: string; value: number }>;
  format: ChartFormat;
  label: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width so text stays 11px however wide the card is.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ticks = niceTicks(Math.max(...points.map((p) => p.value)), format.kind === 'count');
  const top = ticks.at(-1)!;
  const H = height, L = 44, B = 22, T = 18;
  const plotW = W - L, plotH = H - B - T;
  const slot = plotW / points.length;
  const barW = Math.min(44, slot * 0.56);
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const last = points.length - 1;
  const active = hover ?? null;

  return (
    <div ref={box} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full overflow-visible" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#d1d5db' : '#f1f5f9'} strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-gray-400 text-[11px] tabular-nums">{tick(t, format)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = L + slot * i + slot / 2;
          const h = p.value > 0 ? Math.max(2, (p.value / top) * plotH) : 0;
          const isActive = active === i;
          return (
            <g key={p.full}>
              {/* hit target: the whole slot, taller than the mark */}
              <rect
                x={L + slot * i}
                y={T}
                width={slot}
                height={plotH}
                fill={isActive ? '#f8fafc' : 'transparent'}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${p.full}: ${fmt(p.value, format)}`}
                className="outline-none focus-visible:stroke-brand-teal focus-visible:[stroke-width:2]"
              />
              {h > 0 && (
                <path
                  d={`M${cx - barW / 2},${T + plotH} v${-(h - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${h - 4} z`}
                  fill={isActive ? BAR_HOVER : BAR}
                  pointerEvents="none"
                />
              )}
              {i === last && hover === null && p.value > 0 && (
                <text x={cx} y={y(p.value) - 6} textAnchor="middle" className="fill-gray-700 text-[11px] font-semibold tabular-nums">
                  {tick(p.value, format)}
                </text>
              )}
              <text x={cx} y={H - 4} textAnchor="middle" className={`text-[11px] ${isActive ? 'fill-gray-900 font-medium' : 'fill-gray-500'}`}>
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-brand-navy px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${((L + slot * active + slot / 2) / W) * 100}%`,
            top: `${(Math.max(T, y(points[active].value) - 8) / H) * 100}%`,
          }}
        >
          <span className="block text-[11px] text-slate-300">{points[active].full}</span>
          <span className="font-semibold tabular-nums">{fmt(points[active].value, format)}</span>
        </div>
      )}
      <div className="sr-only"><table>
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.full}><th scope="row">{p.full}</th><td>{fmt(p.value, format)}</td></tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
