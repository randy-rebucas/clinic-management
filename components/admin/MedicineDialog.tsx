'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { useSend } from './users-shared';
import ItemList from './ItemList';
import { timesPerDay } from '@/lib/dosage-calculator';
import {
  DURATION_SUGGESTIONS,
  FORM_LABEL,
  FREQUENCY_SUGGESTIONS,
  MEDICINE_FORMS,
  MEDICINE_ROUTES,
  ROUTE_LABEL,
  nameKey,
  type MedicineForm,
  type MedicineRoute,
  type MedicineRow,
} from '@/lib/medicines';

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;
const OUTLINE = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;
const SEGMENT = 'cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal';
const SMALL = `${FIELD} w-16 px-2 text-center font-mono tabular-nums`;

/** Values a new medicine starts with (from a name written on prescriptions, or the category filter). */
export interface MedicinePreset {
  name?: string;
  category?: string;
  standardDosage?: string;
  standardFrequency?: string;
}

interface RangeForm {
  key: number;
  minAge: string;
  maxAge: string;
  minWeight: string;
  maxWeight: string;
  dose: string;
  frequency: string;
  maxDailyDose: string;
}

interface Form {
  name: string;
  genericName: string;
  brandNames: string[];
  form: MedicineForm;
  strength: string;
  route: MedicineRoute;
  category: string;
  standardDosage: string;
  standardFrequency: string;
  duration: string;
  ranges: RangeForm[];
  requiresPrescription: boolean;
  controlledSubstance: boolean;
  schedule: string;
  indications: string[];
  contraindications: string[];
  sideEffects: string[];
}

const text = (n: number | null) => (n === null ? '' : String(n));

function initialForm(row: MedicineRow | null, preset?: MedicinePreset): Form {
  return {
    name: row?.name ?? preset?.name ?? '',
    genericName: row?.genericName ?? '',
    brandNames: row?.brandNames ?? [],
    form: row?.form ?? 'tablet',
    strength: row?.strength ?? '',
    route: row?.route ?? 'oral',
    category: row?.category ?? preset?.category ?? '',
    standardDosage: row?.standardDosage ?? preset?.standardDosage ?? '',
    standardFrequency: row?.standardFrequency ?? preset?.standardFrequency ?? '',
    duration: row?.duration ?? '',
    ranges: (row?.dosageRanges ?? []).map((r, i) => ({
      key: i,
      minAge: text(r.minAge),
      maxAge: text(r.maxAge),
      minWeight: text(r.minWeight),
      maxWeight: text(r.maxWeight),
      dose: r.dose,
      frequency: r.frequency,
      maxDailyDose: r.maxDailyDose ?? '',
    })),
    requiresPrescription: row?.requiresPrescription ?? true,
    controlledSubstance: row?.controlledSubstance ?? false,
    schedule: row?.schedule ?? '',
    indications: row?.indications ?? [],
    contraindications: row?.contraindications ?? [],
    sideEffects: row?.sideEffects ?? [],
  };
}

const NUMBER = /^\d+(\.\d+)?$/;
const toNum = (s: string) => (s.trim() === '' ? null : Number(s));

function problems(f: Form): Record<string, string> {
  const out: Record<string, string> = {};
  if (!f.name.trim()) out.name = 'Enter the medicine’s name, as it should print on the prescription.';
  if (!f.strength.trim()) out.strength = 'Enter the strength, e.g. 500mg or 250mg/5ml.';
  if (!f.category.trim()) out.category = 'Enter a category, e.g. Antibiotic.';
  f.ranges.forEach((r, i) => {
    const bad = (['minAge', 'maxAge', 'minWeight', 'maxWeight'] as const).find((k) => r[k].trim() !== '' && !NUMBER.test(r[k].trim()));
    if (bad) out[`r${i}-${bad}`] = 'Ages and weights are numbers, or leave them blank.';
    else if (toNum(r.minAge) !== null && toNum(r.maxAge) !== null && toNum(r.minAge)! > toNum(r.maxAge)!) out[`r${i}-maxAge`] = 'The youngest age is above the oldest.';
    else if (toNum(r.minWeight) !== null && toNum(r.maxWeight) !== null && toNum(r.minWeight)! > toNum(r.maxWeight)!)
      out[`r${i}-maxWeight`] = 'The lowest weight is above the highest.';
    if (!r.dose.trim()) out[`r${i}-dose`] = 'Enter the dose for this row.';
    if (!r.frequency.trim()) out[`r${i}-frequency`] = 'Enter how often.';
  });
  return out;
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="px-6 py-5">
      <h3 className="text-sm font-bold tracking-tight text-gray-900">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** What a doctor's pickers fill in from these fields, in words. */
function PickPreview({ form }: { form: Form }) {
  const dose = form.standardDosage.trim();
  const freq = form.standardFrequency.trim();
  const days = parseInt(form.duration, 10);
  const perDay = freq ? timesPerDay(freq) : null;
  const strength = form.strength.trim();

  return (
    <div className="mt-3 space-y-1.5 rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm">
      {dose || freq ? (
        <p className="text-gray-700">
          Picking it fills in{' '}
          <span className="font-medium text-gray-900">{[dose || strength || 'the strength', freq || 'As directed', form.duration.trim()].filter(Boolean).join(' · ')}</span>
          {form.ranges.length > 0 && ', unless a dose by age or weight below fits the patient'}.
        </p>
      ) : (
        <p className="text-gray-700">
          With nothing set, the prescription form fills in the strength{strength ? ` (${strength})` : ''} and “As directed”, and the visit note fills in
          nothing.
        </p>
      )}
      {freq &&
        (perDay !== null ? (
          <p className="text-gray-600">
            The prescription form counts <span className="font-mono tabular-nums">{perDay}</span> {perDay === 1 ? 'dose' : 'doses'} a day
            {Number.isFinite(days) && days > 0 && (
              <>
                , so <span className="font-mono tabular-nums">{perDay * days}</span> for {days} {days === 1 ? 'day' : 'days'}
              </>
            )}
            .
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-amber-800">
            <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              The prescription form can’t count doses from “{freq}”, so it counts one a day. Write it as once daily, BID, TID, QID or every 8 hours to get
              the quantity right.
            </span>
          </p>
        ))}
    </div>
  );
}

export default function MedicineDialog({
  row,
  preset,
  rows,
  onClose,
  onSaved,
  onOpen,
}: {
  /** null = add a new medicine. */
  row: MedicineRow | null;
  preset?: MedicinePreset;
  /** The whole list, for name clashes and category suggestions. */
  rows: MedicineRow[];
  onClose: () => void;
  onSaved: (message: string) => void;
  /** Switch to editing a medicine already on file (from the "already on the list" notice). */
  onOpen: (row: MedicineRow) => void;
}) {
  const ids = useId();
  const send = useSend('The medicine couldn’t be saved');
  const [form, setForm] = useState<Form>(() => initialForm(row, preset));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const editing = row !== null;
  const issues = tried ? problems(form) : {};
  const issueCount = Object.keys(issues).length;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setRange = (i: number, key: keyof Omit<RangeForm, 'key'>, value: string) =>
    setForm((f) => ({ ...f, ranges: f.ranges.map((r, j) => (j === i ? { ...r, [key]: value } : r)) }));
  const others = rows.filter((r) => r._id !== row?._id);
  const categories = [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b));

  const sameName = form.name.trim() ? others.find((r) => nameKey(r.name) === nameKey(form.name)) : undefined;
  const sameDrug =
    !sameName && form.genericName.trim() && form.strength.trim()
      ? others.find(
          (r) =>
            r.active &&
            r.form === form.form &&
            nameKey(r.genericName) === nameKey(form.genericName) &&
            nameKey(r.strength).replace(/\s/g, '') === nameKey(form.strength).replace(/\s/g, '')
        )
      : undefined;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const found = problems(form);
    const firstBad = Object.keys(found)[0];
    if (firstBad) {
      refs.current[firstBad]?.focus();
      return;
    }
    setBusy(true);
    setError(null);

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      genericName: form.genericName.trim(),
      brandNames: form.brandNames,
      form: form.form,
      strength: form.strength.trim(),
      route: form.route,
      category: form.category.trim(),
      standardDosage: form.standardDosage.trim(),
      standardFrequency: form.standardFrequency.trim(),
      duration: form.duration.trim(),
      dosageRanges: form.ranges.map((r) => ({
        minAge: toNum(r.minAge),
        maxAge: toNum(r.maxAge),
        minWeight: toNum(r.minWeight),
        maxWeight: toNum(r.maxWeight),
        dose: r.dose.trim(),
        frequency: r.frequency.trim(),
        ...(r.maxDailyDose.trim() ? { maxDailyDose: r.maxDailyDose.trim() } : {}),
      })),
      requiresPrescription: form.requiresPrescription,
      controlledSubstance: form.controlledSubstance,
      schedule: form.controlledSubstance ? form.schedule.trim() : '',
      indications: form.indications,
      contraindications: form.contraindications,
      sideEffects: form.sideEffects,
    };
    if (!editing) for (const key of Object.keys(body)) if (body[key] === '') delete body[key];

    const result = await send(editing ? `/api/medicines/${row._id}` : '/api/medicines', editing ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const name = form.name.trim();
    onSaved(editing ? `Saved ${name}. Prescriptions already written keep what they were written with.` : `Added ${name}. Doctors can pick it when they prescribe.`);
  };

  const input = (key: 'name' | 'genericName' | 'strength' | 'category' | 'standardDosage' | 'standardFrequency' | 'duration' | 'schedule', label: ReactNode, props: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => {
    const err = issues[key];
    return (
      <div>
        <Label htmlFor={`${ids}-${key}`} optional={optional}>
          {label}
        </Label>
        <input
          id={`${ids}-${key}`}
          ref={(el) => {
            refs.current[key] = el;
          }}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
          aria-invalid={!!err}
          aria-describedby={err ? `${ids}-${key}-err` : undefined}
          autoComplete="off"
          maxLength={200}
          {...props}
          className={`${FIELD} ${err ? 'border-red-400' : ''} ${props.className ?? ''}`}
        />
        {err && <FieldError id={`${ids}-${key}-err`}>{err}</FieldError>}
      </div>
    );
  };

  const rangeInput = (i: number, key: keyof Omit<RangeForm, 'key'>, ariaLabel: string, className: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const err = issues[`r${i}-${key}`];
    return (
      <input
        ref={(el) => {
          refs.current[`r${i}-${key}`] = el;
        }}
        value={form.ranges[i][key]}
        onChange={(e) => setRange(i, key, e.target.value)}
        aria-label={`${ariaLabel}, row ${i + 1}`}
        aria-invalid={!!err}
        autoComplete="off"
        maxLength={200}
        {...props}
        className={`${className} ${err ? 'border-red-400' : ''}`}
      />
    );
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-3xl" labelledBy={`${ids}-title`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {editing ? row.name : 'Add a medicine'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {editing
              ? row.active
                ? 'On the list doctors prescribe from. Prescriptions already written keep what they were written with.'
                : 'Taken off the list: doctors don’t see it when they prescribe.'
              : 'Doctors pick it when they prescribe; its form, strength and usual dose are filled in for them.'}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="What it is">
            <div className="space-y-4">
              <div>
                {input('name', 'Name', { placeholder: 'e.g. Amoxicillin 500mg' })}
                {sameName && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-amber-800">
                    <Svg d={ICON.alert} className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {sameName.active ? 'Already on the list' : 'Already on file, taken off the list'} ({FORM_LABEL[sameName.form].toLowerCase()}, {sameName.strength}).
                    </span>
                    {!busy && (
                      <button type="button" onClick={() => onOpen(sameName)} className={`rounded font-semibold text-brand-teal-dark underline-offset-2 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        Open it
                      </button>
                    )}
                  </p>
                )}
                {sameDrug && (
                  <p className="mt-1.5 text-sm text-gray-600">
                    {sameDrug.name} is the same generic medicine, form and strength.
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {input('genericName', 'Generic name', { placeholder: 'e.g. Amoxicillin' }, true)}
                <div>
                  {input('category', 'Category', { list: `${ids}-categories`, placeholder: 'e.g. Antibiotic' })}
                  <datalist id={`${ids}-categories`}>
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-gray-700">Form</legend>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1 sm:grid-cols-4">
                  {MEDICINE_FORMS.map((f) => {
                    const on = form.form === f;
                    return (
                      <label key={f} className={`${SEGMENT} ${on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <input type="radio" name={`${ids}-form`} value={f} checked={on} onChange={() => set('form', f)} className="sr-only" />
                        {FORM_LABEL[f]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                {input('strength', 'Strength', { placeholder: 'e.g. 500mg or 250mg/5ml', className: 'font-mono tabular-nums' })}
                <div>
                  <Label htmlFor={`${ids}-route`}>Given</Label>
                  <select id={`${ids}-route`} value={form.route} onChange={(e) => set('route', e.target.value as MedicineRoute)} className={FIELD}>
                    {MEDICINE_ROUTES.map((r) => (
                      <option key={r} value={r}>
                        {ROUTE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ItemList id={`${ids}-brands`} label="Brand names" values={form.brandNames} onChange={(v) => set('brandNames', v)} placeholder="Type one and press Enter, e.g. Amoxil" />
              <p className="-mt-2 text-sm text-gray-500">Doctors can find it by any of these names.</p>
            </div>
          </Section>

          <Section title="When a doctor picks it" hint="These fill in the prescription and the visit note. The doctor can still change them for the patient.">
            <div className="grid gap-4 sm:grid-cols-3">
              {input('standardDosage', 'Usual dose', { placeholder: 'e.g. 500mg' }, true)}
              <div>
                {input('standardFrequency', 'How often', { list: `${ids}-freq`, placeholder: 'e.g. TID' }, true)}
                <datalist id={`${ids}-freq`}>
                  {FREQUENCY_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div>
                {input('duration', 'For how long', { list: `${ids}-dur`, placeholder: 'e.g. 7 days' }, true)}
                <datalist id={`${ids}-dur`}>
                  {DURATION_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>
            <PickPreview form={form} />
          </Section>

          <Section
            title="Doses by age or weight"
            hint="The prescription form uses the first row that fits the patient’s age and weight instead of the usual dose. Leave a limit blank for no limit; a dose like “10 mg/kg” is worked out from the patient’s weight."
          >
            {form.ranges.length > 0 && (
              <ol className="mb-3 divide-y divide-gray-100 rounded-md border border-gray-200">
                {form.ranges.map((r, i) => {
                  const rowIssues = Object.entries(issues).filter(([k]) => k.startsWith(`r${i}-`));
                  return (
                    <li key={r.key} className="motion-row-in px-3 py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-gray-700">
                        <span className="font-mono text-xs tabular-nums text-gray-500">{i + 1}</span>
                        <span>Ages</span>
                        {rangeInput(i, 'minAge', 'Youngest age in years', SMALL, { inputMode: 'decimal' })}
                        <span>to</span>
                        {rangeInput(i, 'maxAge', 'Oldest age in years', SMALL, { inputMode: 'decimal' })}
                        <span>years,</span>
                        {rangeInput(i, 'minWeight', 'Lowest weight in kilograms', SMALL, { inputMode: 'decimal' })}
                        <span>to</span>
                        {rangeInput(i, 'maxWeight', 'Highest weight in kilograms', SMALL, { inputMode: 'decimal' })}
                        <span>kg</span>
                        <button
                          type="button"
                          onClick={() => set('ranges', form.ranges.filter((_, j) => j !== i))}
                          aria-label={`Remove dose row ${i + 1}`}
                          className={`ml-auto rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`}
                        >
                          <Svg d={ICON.x} />
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {rangeInput(i, 'dose', 'Dose', FIELD, { placeholder: 'Dose, e.g. 10 mg/kg' })}
                        {rangeInput(i, 'frequency', 'How often', FIELD, { placeholder: 'How often, e.g. TID', list: `${ids}-freq` })}
                        {rangeInput(i, 'maxDailyDose', 'Most in a day (optional)', FIELD, { placeholder: 'Most a day (optional)' })}
                      </div>
                      {rowIssues.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {[...new Set(rowIssues.map(([, m]) => m))].map((m) => (
                            <li key={m} className="flex items-start gap-1.5 text-sm font-medium text-red-700">
                              <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              {m}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <button
              type="button"
              onClick={() => set('ranges', [...form.ranges, { key: Math.max(-1, ...form.ranges.map((r) => r.key)) + 1, minAge: '', maxAge: '', minWeight: '', maxWeight: '', dose: '', frequency: '', maxDailyDose: '' }])}
              className={OUTLINE}
            >
              <Svg d="M12 5v14m7-7H5" />
              Add a dose by age or weight
            </button>
          </Section>

          <Section title="Prescription rules">
            <div className="space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.requiresPrescription}
                  onChange={(e) => set('requiresPrescription', e.target.checked)}
                  className={`mt-0.5 h-4 w-4 rounded border-gray-300 accent-brand-teal-dark ${FOCUS_RING}`}
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Needs a prescription</span>
                  <span className="block text-sm text-gray-500">Untick it for medicines sold over the counter; the list marks them so.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.controlledSubstance}
                  onChange={(e) => set('controlledSubstance', e.target.checked)}
                  className={`mt-0.5 h-4 w-4 rounded border-gray-300 accent-brand-teal-dark ${FOCUS_RING}`}
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Controlled substance</span>
                  <span className="block text-sm text-gray-500">A dangerous drug or other regulated medicine. The list marks it, with its schedule beside it.</span>
                </span>
              </label>
              {form.controlledSubstance && (
                <div className="motion-panel-in pl-7 sm:max-w-sm">{input('schedule', 'Schedule or class', { placeholder: 'e.g. Dangerous drug (S2)' }, true)}</div>
              )}
            </div>
          </Section>

          <Section title="For reference" hint="Kept on this list for staff to look up. Prescriptions don’t show these.">
            <div className="space-y-4">
              <ItemList id={`${ids}-ind`} label="Used for" values={form.indications} onChange={(v) => set('indications', v)} placeholder="e.g. Pain, Fever" />
              <ItemList id={`${ids}-contra`} label="Not to be given with" values={form.contraindications} onChange={(v) => set('contraindications', v)} placeholder="e.g. Penicillin allergy" />
              <ItemList id={`${ids}-side`} label="Side effects" values={form.sideEffects} onChange={(v) => set('sideEffects', v)} placeholder="e.g. Nausea" />
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || issueCount ? 'font-medium text-red-700' : 'text-gray-500'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ?? (issueCount ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} fixing.` : busy ? 'Saving…' : 'Changes are recorded in the audit log.')}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to the list'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
