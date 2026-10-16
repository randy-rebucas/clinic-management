'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../../appointments/shared';

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export function Section({ id, title, hint, aside, children }: { id: string; title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Label({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
      {children}
      {optional && <span className="font-normal text-gray-500"> (optional)</span>}
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
      <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** A textarea that grows with its text (where the browser supports field-sizing). */
export function NoteArea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
  describedBy,
  label,
  invalid,
  maxLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  describedBy?: string;
  label?: string;
  invalid?: boolean;
  maxLength?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      aria-describedby={describedBy}
      aria-label={label}
      aria-invalid={invalid || undefined}
      maxLength={maxLength}
      className={`${FIELD} resize-y leading-relaxed [field-sizing:content] ${invalid ? 'border-red-400' : ''}`}
      style={{ minHeight: `${rows * 1.6 + 1}rem` }}
    />
  );
}

export const ADD_BUTTON = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep ${FOCUS_RING}`;
export const REMOVE_BUTTON = `rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`;

// ---------------------------------------------------------------------------
// Vital signs
// ---------------------------------------------------------------------------

export type VitalKey = 'bp' | 'hr' | 'rr' | 'tempC' | 'spo2' | 'heightCm' | 'weightKg' | 'bmi';
export type VitalsText = Record<VitalKey, string>;

/** Plausible ranges for any age, wide enough for infants; the same ones triage uses. */
export const VITAL_FIELDS: { key: Exclude<VitalKey, 'bp' | 'bmi'>; label: string; unit: string; min: number; max: number; step: string; placeholder: string }[] = [
  { key: 'hr', label: 'Heart rate', unit: 'bpm', min: 30, max: 250, step: '1', placeholder: '72' },
  { key: 'rr', label: 'Breathing rate', unit: '/min', min: 8, max: 80, step: '1', placeholder: '16' },
  { key: 'tempC', label: 'Temperature', unit: '°C', min: 30, max: 45, step: '0.1', placeholder: '36.5' },
  { key: 'spo2', label: 'Oxygen (SpO₂)', unit: '%', min: 50, max: 100, step: '1', placeholder: '98' },
  { key: 'heightCm', label: 'Height', unit: 'cm', min: 30, max: 250, step: '0.1', placeholder: '160' },
  { key: 'weightKg', label: 'Weight', unit: 'kg', min: 0.5, max: 300, step: '0.1', placeholder: '60' },
];

export const EMPTY_VITALS: VitalsText = { bp: '', hr: '', rr: '', tempC: '', spo2: '', heightCm: '', weightKg: '', bmi: '' };

export function vitalsToText(v?: Partial<Record<VitalKey, string | number | null>> | null): VitalsText {
  const out = { ...EMPTY_VITALS };
  if (!v) return out;
  (Object.keys(out) as VitalKey[]).forEach((k) => {
    const val = v[k];
    if (val !== null && val !== undefined && val !== '') out[k] = String(val);
  });
  return out;
}

export function bmiFrom(t: VitalsText): number | null {
  const h = parseFloat(t.heightCm);
  const w = parseFloat(t.weightKg);
  return h > 0 && w > 0 ? Math.round((w / (h / 100) ** 2) * 10) / 10 : null;
}

/** Per-field problems, keyed by vital. Empty means every entered reading is plausible. */
export function vitalsProblems(t: VitalsText): Partial<Record<VitalKey, string>> {
  const out: Partial<Record<VitalKey, string>> = {};
  if (t.bp.trim() && !/^\d{2,3}\s*\/\s*\d{2,3}$/.test(t.bp.trim())) out.bp = 'Enter as systolic/diastolic, for example 120/80.';
  for (const f of VITAL_FIELDS) {
    const raw = t[f.key].trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < f.min || n > f.max) out[f.key] = `Between ${f.min} and ${f.max} ${f.unit}.`;
  }
  if (t.bmi.trim() && bmiFrom(t) === null) {
    const n = Number(t.bmi);
    if (!Number.isFinite(n) || n < 5 || n > 100) out.bmi = 'Between 5 and 100.';
  }
  return out;
}

export function vitalsToRecord(t: VitalsText): Partial<Record<VitalKey, string | number>> | undefined {
  const out: Partial<Record<VitalKey, string | number>> = {};
  if (t.bp.trim()) out.bp = t.bp.replace(/\s+/g, '');
  for (const f of VITAL_FIELDS) if (t[f.key].trim()) out[f.key] = Number(t[f.key]);
  const bmi = bmiFrom(t) ?? (t.bmi.trim() ? Number(t.bmi) : null);
  if (bmi !== null) out.bmi = bmi;
  return Object.keys(out).length ? out : undefined;
}

/** "BP 120/80, HR 72, Temp 36.8 °C …" for pasting into the objective note. */
export function vitalsSentence(t: VitalsText) {
  const r = vitalsToRecord(t);
  if (!r) return '';
  const parts = [
    r.bp && `BP ${r.bp} mmHg`,
    r.hr !== undefined && `HR ${r.hr} bpm`,
    r.rr !== undefined && `RR ${r.rr}/min`,
    r.tempC !== undefined && `Temp ${r.tempC} °C`,
    r.spo2 !== undefined && `SpO₂ ${r.spo2}%`,
    r.weightKg !== undefined && `Wt ${r.weightKg} kg`,
    r.heightCm !== undefined && `Ht ${r.heightCm} cm`,
    r.bmi !== undefined && `BMI ${r.bmi}`,
  ].filter(Boolean);
  return `Vital signs: ${parts.join(', ')}.`;
}

export function VitalsFields({ value, onChange, problems }: { value: VitalsText; onChange: (v: VitalsText) => void; problems: Partial<Record<VitalKey, string>> }) {
  const ids = useId();
  const bmi = bmiFrom(value);
  const cell = 'border-r border-b border-gray-200 p-4';

  return (
    <div className="grid -mr-px -mb-px grid-cols-2 sm:grid-cols-4">
      <div className={cell}>
        <Label htmlFor={`${ids}-bp`}>
          Blood pressure <span className="font-normal text-gray-500">mmHg</span>
        </Label>
        <input
          id={`${ids}-bp`}
          inputMode="numeric"
          value={value.bp}
          onChange={(e) => onChange({ ...value, bp: e.target.value })}
          placeholder="120/80"
          aria-invalid={Boolean(problems.bp)}
          aria-describedby={problems.bp ? `${ids}-bp-err` : undefined}
          className={`${FIELD} font-mono tabular-nums ${problems.bp ? 'border-red-400' : ''}`}
        />
        {problems.bp && <FieldError id={`${ids}-bp-err`}>{problems.bp}</FieldError>}
      </div>
      {VITAL_FIELDS.map((f) => (
        <div key={f.key} className={cell}>
          <Label htmlFor={`${ids}-${f.key}`}>
            {f.label} <span className="font-normal text-gray-500">{f.unit}</span>
          </Label>
          <input
            id={`${ids}-${f.key}`}
            type="number"
            inputMode="decimal"
            min={f.min}
            max={f.max}
            step={f.step}
            value={value[f.key]}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            aria-invalid={Boolean(problems[f.key])}
            aria-describedby={problems[f.key] ? `${ids}-${f.key}-err` : undefined}
            className={`${FIELD} font-mono tabular-nums ${problems[f.key] ? 'border-red-400' : ''}`}
          />
          {problems[f.key] && <FieldError id={`${ids}-${f.key}-err`}>{problems[f.key]}</FieldError>}
        </div>
      ))}
      <div className={cell}>
        <Label htmlFor={`${ids}-bmi`}>
          BMI <span className="font-normal text-gray-500">kg/m²</span>
        </Label>
        {bmi !== null ? (
          <>
            <output id={`${ids}-bmi`} className="flex h-[38px] items-center font-mono text-sm font-semibold tabular-nums text-gray-900">
              {bmi}
            </output>
            <p className="mt-1.5 text-xs text-gray-500">From height and weight</p>
          </>
        ) : (
          <>
            <input
              id={`${ids}-bmi`}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={value.bmi}
              onChange={(e) => onChange({ ...value, bmi: e.target.value })}
              placeholder="—"
              aria-describedby={`${ids}-bmi-hint`}
              className={`${FIELD} font-mono tabular-nums ${problems.bmi ? 'border-red-400' : ''}`}
            />
            <p id={`${ids}-bmi-hint`} className="mt-1.5 text-xs text-gray-500">
              {problems.bmi ?? 'Worked out once height and weight are in'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search-as-you-type pickers (ICD-10, medicine names)
// ---------------------------------------------------------------------------

/**
 * Fetches suggestions for `query` after a pause. Results are keyed by the query they answer,
 * so a stale response never shows under a newer query and nothing is reset inside an effect.
 */
function useSuggestions<T>(url: (q: string) => string | null, query: string, enabled: boolean) {
  const [result, setResult] = useState<{ q: string; items: T[] } | null>(null);
  const target = enabled ? url(query.trim()) : null;

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    const q = query.trim();
    const t = setTimeout(() => {
      fetch(target, { signal: controller.signal })
        .then((res) => res.json())
        .then((json) => setResult({ q, items: json?.success && Array.isArray(json.data) ? json.data : [] }))
        .catch(() => {
          if (!controller.signal.aborted) setResult({ q, items: [] });
        });
    }, 200);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [target, query]);

  return target && result?.q === query.trim() ? result.items : [];
}

function Suggestions<T>({
  id,
  items,
  highlight,
  onHighlight,
  onPick,
  render,
  label,
}: {
  id: string;
  items: T[];
  highlight: number;
  onHighlight: (i: number) => void;
  onPick: (item: T) => void;
  render: (item: T) => ReactNode;
  label: string;
}) {
  return (
    <ul
      id={id}
      role="listbox"
      aria-label={label}
      className="motion-panel-in absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_30px_rgb(15,23,42,0.1)]"
    >
      {items.map((item, i) => (
        <li
          key={i}
          id={`${id}-${i}`}
          role="option"
          aria-selected={highlight === i}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item)}
          onMouseEnter={() => onHighlight(i)}
          className={`cursor-pointer rounded-md px-3 py-2 text-sm ${highlight === i ? 'bg-brand-teal-light/60' : ''}`}
        >
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

function useCombobox<T>(items: T[], onPick: (item: T) => void) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const show = open && items.length > 0;
  const pick = (item: T) => {
    onPick(item);
    setOpen(false);
    setHighlight(-1);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!show) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      pick(items[highlight]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  };
  return {
    show,
    highlight,
    setHighlight,
    pick,
    onKeyDown,
    open: () => setOpen(true),
    close: () => setTimeout(() => setOpen(false), 120),
    reset: () => setHighlight(-1),
  };
}

export interface Icd10 {
  code: string;
  description: string;
}

/** ICD-10 code field: type a code or words; picking a match fills both code and description. */
export function Icd10Field({ id, code, onCode, onPick, rowLabel }: { id: string; code: string; onCode: (v: string) => void; onPick: (r: Icd10) => void; rowLabel: string }) {
  const items = useSuggestions<Icd10>((q) => (q.length >= 2 ? `/api/icd10/search?q=${encodeURIComponent(q)}` : null), code, true).slice(0, 10);
  const box = useCombobox(items, onPick);
  const listId = `${id}-list`;
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={box.show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={box.show && box.highlight >= 0 ? `${listId}-${box.highlight}` : undefined}
        aria-label={`${rowLabel}: ICD-10 code`}
        autoComplete="off"
        value={code}
        placeholder="Code or words, e.g. J06.9"
        onChange={(e) => {
          onCode(e.target.value);
          box.open();
          box.reset();
        }}
        onFocus={box.open}
        onBlur={box.close}
        onKeyDown={box.onKeyDown}
        className={`${FIELD} font-mono`}
      />
      {box.show && (
        <Suggestions
          id={listId}
          label="Matching ICD-10 codes"
          items={items}
          highlight={box.highlight}
          onHighlight={box.setHighlight}
          onPick={box.pick}
          render={(r) => (
            <>
              <span className="mr-2 font-mono text-xs font-semibold text-gray-900">{r.code}</span>
              <span className="text-gray-700">{r.description}</span>
            </>
          )}
        />
      )}
    </div>
  );
}

export interface MedicineSuggestion {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  source?: string;
}

/** Medicine name with suggestions from the clinic's catalogue and past prescriptions. */
export function MedicineNameField({
  id,
  value,
  onChange,
  onPick,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (s: MedicineSuggestion) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [focused, setFocused] = useState(false);
  const all = useSuggestions<MedicineSuggestion>((q) => `/api/medications/autocomplete?search=${encodeURIComponent(q)}`, value, focused);
  const q = value.trim().toLowerCase();
  const items = (q ? all.filter((s) => s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q) : all).slice(0, 12);
  const box = useCombobox(items, onPick);
  const listId = `${id}-list`;
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={box.show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={box.show && box.highlight >= 0 ? `${listId}-${box.highlight}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        autoComplete="off"
        value={value}
        placeholder="e.g. Amoxicillin"
        onChange={(e) => {
          onChange(e.target.value);
          box.open();
          box.reset();
        }}
        onFocus={() => {
          setFocused(true);
          box.open();
        }}
        onBlur={() => {
          box.close();
          setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={box.onKeyDown}
        className={`${FIELD} ${invalid ? 'border-red-400' : ''}`}
      />
      {box.show && (
        <Suggestions
          id={listId}
          label="Suggested medicines"
          items={items}
          highlight={box.highlight}
          onHighlight={box.setHighlight}
          onPick={box.pick}
          render={(s) => (
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-gray-900">{s.name}</span>
              {(s.dosage || s.frequency) && <span className="shrink-0 text-xs text-gray-500">{[s.dosage, s.frequency].filter(Boolean).join(' · ')}</span>}
            </span>
          )}
        />
      )}
    </div>
  );
}

// Common values offered as browser suggestions (any text is still accepted).
export const DOSAGE_OPTIONS = ['5 mg', '10 mg', '25 mg', '50 mg', '100 mg', '250 mg', '500 mg', '1 g', '5 mL', '10 mL', '1 tablet', '2 tablets'];
export const FREQUENCY_OPTIONS = [
  'Once daily (OD)',
  'Twice daily (BID)',
  'Three times daily (TID)',
  'Four times daily (QID)',
  'Every 6 hours',
  'Every 8 hours',
  'Every 12 hours',
  'At bedtime (HS)',
  'As needed (PRN)',
  'Once weekly',
];
export const DURATION_OPTIONS = ['1 day', '3 days', '5 days', '7 days', '10 days', '14 days', '1 month', '3 months', 'Ongoing', 'Until finished'];
