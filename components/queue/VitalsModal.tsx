'use client';

import { useId, useState } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';

export interface Vitals {
  bp?: string;
  hr?: number;
  rr?: number;
  tempC?: number;
  spo2?: number;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
}

type NumKey = 'hr' | 'rr' | 'tempC' | 'spo2' | 'heightCm' | 'weightKg';

const FIELDS: { key: NumKey; label: string; unit: string; min: number; max: number; step?: string; placeholder: string }[] = [
  { key: 'hr', label: 'Heart rate', unit: 'bpm', min: 30, max: 250, placeholder: '72' },
  { key: 'rr', label: 'Breathing rate', unit: '/min', min: 8, max: 60, placeholder: '16' },
  { key: 'tempC', label: 'Temperature', unit: '°C', min: 30, max: 45, step: '0.1', placeholder: '36.5' },
  { key: 'spo2', label: 'Oxygen (SpO₂)', unit: '%', min: 50, max: 100, placeholder: '98' },
  { key: 'heightCm', label: 'Height', unit: 'cm', min: 50, max: 250, step: '0.1', placeholder: '160' },
  { key: 'weightKg', label: 'Weight', unit: 'kg', min: 2, max: 300, step: '0.1', placeholder: '60' },
];

/** "BP 120/80 · 36.8 °C · SpO₂ 98%" — the readings a doctor scans first. */
export function vitalsSummary(v?: Vitals | null) {
  if (!v) return '';
  return [
    v.bp && `BP ${v.bp}`,
    v.tempC != null && `${v.tempC} °C`,
    v.hr != null && `HR ${v.hr}`,
    v.spo2 != null && `SpO₂ ${v.spo2}%`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export const hasVitals = (v?: Vitals | null) => Boolean(v && Object.values(v).some((x) => x !== null && x !== undefined && x !== ''));

/** Record or update the vital signs taken at triage; they carry into the visit started from the queue. */
export default function VitalsModal({
  patientName,
  queueLabel,
  initial,
  onClose,
  onSave,
}: {
  patientName: string;
  queueLabel: string;
  initial?: Vitals | null;
  onClose: () => void;
  onSave: (vitals: Vitals) => Promise<string | null>;
}) {
  const ids = useId();
  const [bp, setBp] = useState(initial?.bp ?? '');
  const [values, setValues] = useState<Record<NumKey, string>>(() => {
    const out = {} as Record<NumKey, string>;
    FIELDS.forEach((f) => (out[f.key] = initial?.[f.key] != null ? String(initial[f.key]) : ''));
    return out;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const updating = hasVitals(initial);

  const h = parseFloat(values.heightCm);
  const w = parseFloat(values.weightKg);
  const bmi = h > 0 && w > 0 ? Math.round((w / (h / 100) ** 2) * 10) / 10 : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const vitals: Vitals = {};
    if (bp.trim()) {
      if (!/^\d{2,3}\/\d{2,3}$/.test(bp.trim())) return setError('Enter blood pressure as systolic/diastolic, for example 120/80.');
      vitals.bp = bp.trim();
    }
    for (const f of FIELDS) {
      const raw = values[f.key].trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) return setError(`${f.label} should be between ${f.min} and ${f.max} ${f.unit}.`);
      vitals[f.key] = n;
    }
    if (bmi) vitals.bmi = bmi;
    if (Object.keys(vitals).length === 0) return setError('Enter at least one reading.');

    setError(null);
    setSaving(true);
    const failure = await onSave(vitals);
    setSaving(false);
    if (failure) setError(failure);
  };

  return (
    <Modal open onOpenChange={(open) => !open && !saving && onClose()} className="max-w-xl" labelledBy={`${ids}-title`}>
      <form onSubmit={submit}>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {updating ? 'Update vital signs' : 'Record vital signs'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {patientName} · <span className="font-mono">{queueLabel}</span>. They carry into the visit when the doctor starts it from the queue.
          </p>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <Svg d={ICON.alert} className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={`${ids}-bp`} className="mb-1.5 block text-sm font-medium text-gray-700">
                Blood pressure <span className="font-normal text-gray-500">mmHg</span>
              </label>
              <input id={`${ids}-bp`} inputMode="numeric" value={bp} onChange={(e) => setBp(e.target.value)} placeholder="120/80" autoFocus className={`${FIELD} font-mono`} />
            </div>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`${ids}-${f.key}`} className="mb-1.5 block text-sm font-medium text-gray-700">
                  {f.label} <span className="font-normal text-gray-500">{f.unit}</span>
                </label>
                <input
                  id={`${ids}-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? '1'}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className={`${FIELD} font-mono`}
                />
              </div>
            ))}
          </div>
          <p className="rounded-md bg-gray-50 px-3.5 py-2.5 text-sm text-gray-600" aria-live="polite">
            BMI{' '}
            {bmi ? (
              <>
                <span className="font-mono font-semibold text-gray-900">{bmi}</span> kg/m², worked out from height and weight
              </>
            ) : (
              'appears once height and weight are entered'
            )}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`}
          >
            Close
          </button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            {saving ? 'Saving…' : updating ? 'Update vitals' : 'Save vitals'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
