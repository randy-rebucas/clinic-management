'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SERIES, TableTwin, TipRow, useTooltip } from '../dashboards/charts';

export interface VitalsRecord {
  bp?: string | null;
  hr?: number | null;
  rr?: number | null;
  tempC?: number | null;
  spo2?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  bmi?: number | null;
}

export interface VitalsReading {
  _id: string;
  visitCode?: string;
  date: string;
  vitals?: VitalsRecord | null;
}

type Key = keyof VitalsRecord;

const VITALS: { key: Key; label: string; short: string; unit: string; digits: number }[] = [
  { key: 'bp', label: 'Blood pressure', short: 'BP', unit: 'mmHg', digits: 0 },
  { key: 'hr', label: 'Heart rate', short: 'HR', unit: 'bpm', digits: 0 },
  { key: 'rr', label: 'Respiratory rate', short: 'RR', unit: '/min', digits: 0 },
  { key: 'tempC', label: 'Temperature', short: 'Temp', unit: '°C', digits: 1 },
  { key: 'spo2', label: 'SpO₂', short: 'SpO₂', unit: '%', digits: 0 },
  { key: 'weightKg', label: 'Weight', short: 'Weight', unit: 'kg', digits: 1 },
  { key: 'heightCm', label: 'Height', short: 'Height', unit: 'cm', digits: 0 },
  { key: 'bmi', label: 'BMI', short: 'BMI', unit: 'kg/m²', digits: 1 },
];

/** The current visit's mark is one step deeper than the history marks. */
const CURRENT = '#0A7F7E';

function parseBp(v: unknown): { sys: number; dia: number } | null {
  const m = typeof v === 'string' ? /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(v) : null;
  return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null;
}

const hasValue = (key: Key, v: unknown) => (key === 'bp' ? typeof v === 'string' && v.trim() !== '' : typeof v === 'number' && Number.isFinite(v));

export const hasAnyVitals = (v?: VitalsRecord | null) => Boolean(v && VITALS.some((s) => hasValue(s.key, v[s.key])));

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function fmt(key: Key, v: unknown, digits: number) {
  if (key === 'bp') return String(v).replace(/\s+/g, '');
  return (v as number).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits ? 1 : 0 });
}

/**
 * Vital signs for this visit, each with its trend over the patient's earlier visits.
 * `history` is oldest first and excludes this visit.
 */
export default function VitalsPanel({
  current,
  visit,
  history,
  mode = 'visit',
}: {
  current?: VitalsRecord | null;
  visit?: VitalsReading;
  history: VitalsReading[] | null;
  /** 'patient': no current visit; each vital shows its latest reading across `history`. */
  mode?: 'visit' | 'patient';
}) {
  const patientMode = mode === 'patient' || !visit;
  const readings: (VitalsReading & { current?: boolean })[] = patientMode ? [...(history ?? [])] : [...(history ?? []), { ...visit!, vitals: current, current: true }];
  const recorded = VITALS.filter((s) => (patientMode ? readings.some((r) => r.vitals && hasValue(s.key, r.vitals[s.key])) : current && hasValue(s.key, current[s.key])));
  const tableCols = VITALS.filter((s) => readings.some((r) => r.vitals && hasValue(s.key, r.vitals[s.key])));
  const earlier = (history ?? []).filter((h) => hasAnyVitals(h.vitals)).length;

  return (
    <section className="motion-panel-in rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby="visit-vitals">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 id="visit-vitals" className="text-base font-bold tracking-tight text-gray-900">
          Vital signs
        </h2>
        <p className="mt-0.5 text-sm text-gray-500">
          {patientMode
            ? earlier === 0
              ? 'None recorded yet. Readings from triage and visit notes appear here.'
              : `Latest reading of each, with its trend over the last ${earlier === 1 ? 'visit' : `${earlier} visits`} that had vital signs.`
            : recorded.length === 0
            ? 'None recorded at this visit.'
            : earlier > 0
              ? `This visit, against the patient's last ${earlier === 1 ? 'visit' : `${earlier} visits`}.`
              : 'First visit with vital signs on file.'}
        </p>
      </div>
      {recorded.length > 0 && (
        <div className="grid -mr-px -mb-px grid-cols-2 sm:grid-cols-4">
          {recorded.map((spec) => (
            <VitalCell key={spec.key} spec={spec} readings={readings} dated={patientMode} />
          ))}
        </div>
      )}
      {readings.length > 1 && tableCols.length > 0 && (
        <TableTwin
          caption="Vital signs by visit"
          head={['Visit', ...tableCols.map((c) => `${c.short} (${c.unit})`)]}
          rows={[...readings].reverse().map((r) => [
            <span key="d">
              <span className="font-mono tabular-nums text-gray-900">{shortDate(r.date)}</span>
              {r.current && <span className="text-gray-500"> · this visit</span>}
            </span>,
            ...tableCols.map((c) => (r.vitals && hasValue(c.key, r.vitals[c.key]) ? fmt(c.key, r.vitals[c.key], c.digits) : '—')),
          ])}
        />
      )}
    </section>
  );
}

function VitalCell({ spec, readings, dated }: { spec: (typeof VITALS)[number]; readings: (VitalsReading & { current?: boolean })[]; dated?: boolean }) {
  const series = readings.filter((r) => r.vitals && hasValue(spec.key, r.vitals[spec.key]));
  const now = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const value = now.vitals![spec.key];

  let change: string | null = null;
  if (prev) {
    const before = prev.vitals![spec.key];
    if (spec.key === 'bp') {
      change = `was ${fmt('bp', before, 0)} on ${shortDate(prev.date)}`;
    } else {
      const diff = Number(((value as number) - (before as number)).toFixed(spec.digits));
      change =
        diff === 0
          ? `same as ${shortDate(prev.date)}`
          : `${diff > 0 ? 'up' : 'down'} ${fmt(spec.key, Math.abs(diff), spec.digits)} since ${shortDate(prev.date)}`;
    }
  }

  return (
    <div className="border-r border-b border-gray-200 p-4 sm:p-5">
      <p className="text-sm text-gray-600">{spec.label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-gray-900">{fmt(spec.key, value, spec.digits)}</span>
        <span className="text-sm text-gray-500">{spec.unit}</span>
      </p>
      <p className="mt-0.5 min-h-5 text-xs text-gray-500">
        {dated ? (
          <>
            <span className="font-mono">{shortDate(now.date)}</span>
            {change ? ` · ${change}` : ''}
          </>
        ) : (
          change ?? 'No earlier reading'
        )}
      </p>
      {series.length > 1 && <Trend spec={spec} series={series} />}
    </div>
  );
}

/**
 * A small trend of one vital: a 2px line with dots, or for blood pressure a bar from diastolic
 * to systolic at each visit. Dots are HTML so they stay round while the plot stretches.
 * One tab stop; arrow keys step through the visits.
 */
function Trend({ spec, series }: { spec: (typeof VITALS)[number]; series: (VitalsReading & { current?: boolean })[] }) {
  const tip = useTooltip();
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const isBp = spec.key === 'bp';

  const values = series.map((r) => {
    const v = r.vitals![spec.key];
    if (isBp) {
      const bp = parseBp(v);
      return bp ? { hi: bp.sys, lo: bp.dia } : null;
    }
    return { hi: v as number, lo: v as number };
  });
  const known = values.filter((v): v is { hi: number; lo: number } => v !== null);
  if (known.length < 2) return null;

  const max = Math.max(...known.map((v) => v.hi));
  const min = Math.min(...known.map((v) => v.lo));
  const pad = Math.max((max - min) * 0.15, max === min ? Math.max(1, Math.abs(max) * 0.05) : 0);
  const top = max + pad;
  const bottom = min - pad;
  const y = (v: number) => ((top - v) / (top - bottom)) * 100;
  const x = (i: number) => (series.length === 1 ? 50 : (i / (series.length - 1)) * 100);

  const show = (i: number) => {
    setActive(i);
    const el = marks.current[i];
    const r = series[i];
    if (!el) return;
    tip.showFor(
      el,
      <>
        <p className="mb-1 font-medium text-gray-900">
          {shortDate(r.date)}
          {r.current ? ' · this visit' : ''}
        </p>
        <TipRow color={r.current ? CURRENT : SERIES.teal} kind={isBp ? 'bar' : 'line'} label={spec.short} value={`${fmt(spec.key, r.vitals![spec.key], spec.digits)} ${spec.unit}`} />
      </>
    );
  };
  const clear = () => {
    setActive(null);
    tip.hide();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * (series.length - 1));
    const next = Math.min(series.length - 1, Math.max(0, i));
    if (next !== active) show(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? series.length - 1;
    const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? series.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    show(Math.min(series.length - 1, Math.max(0, next)));
  };

  const line = values
    .map((v, i) => (v ? `${x(i)},${y(v.hi)}` : null))
    .filter(Boolean)
    .join(' ');
  const activeReading = active !== null ? series[active] : null;

  return (
    <div className="mt-3">
      <div
        tabIndex={0}
        role="group"
        aria-label={`${spec.label} at the last ${series.length} visits. Use the arrow keys to read each visit, or View as table below.`}
        onPointerMove={onPointerMove}
        onPointerLeave={clear}
        onFocus={() => show(active ?? series.length - 1)}
        onBlur={clear}
        onKeyDown={onKeyDown}
        className="relative h-10 cursor-crosshair rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-4"
      >
        {!isBp && (
          <svg className="motion-line-in absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={line} fill="none" stroke={SERIES.teal} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
        {values.map((v, i) => {
          if (!v) return null;
          const r = series[i];
          const color = r.current ? CURRENT : SERIES.teal;
          const on = active === i;
          return isBp ? (
            <span
              key={r._id}
              ref={(el) => {
                marks.current[i] = el;
              }}
              aria-hidden="true"
              className="motion-chip-in absolute w-1 -translate-x-1/2 rounded-full"
              style={{ left: `${x(i)}%`, top: `${y(v.hi)}%`, height: `max(4px, ${y(v.lo) - y(v.hi)}%)`, background: color, boxShadow: on ? `0 0 0 2px #fff, 0 0 0 3px ${color}` : undefined }}
            />
          ) : (
            <span
              key={r._id}
              ref={(el) => {
                marks.current[i] = el;
              }}
              aria-hidden="true"
              className="motion-chip-in absolute h-2 w-2 rounded-full"
              style={{
                left: `${x(i)}%`,
                top: `${y(v.hi)}%`,
                transform: 'translate(-50%, -50%)',
                background: color,
                boxShadow: on ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}` : '0 0 0 2px #fff',
              }}
            />
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {activeReading ? `${shortDate(activeReading.date)}${activeReading.current ? ', this visit' : ''}: ${fmt(spec.key, activeReading.vitals![spec.key], spec.digits)} ${spec.unit}` : ''}
      </p>
      {tip.node}
    </div>
  );
}
