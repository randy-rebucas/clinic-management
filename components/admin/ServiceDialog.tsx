'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { useSend } from './users-shared';
import { VISIT_TYPES, visitTypeLabel } from '@/lib/visit-types';
import {
  CATEGORY,
  FALLBACK_VISIT_FEE,
  SERVICE_CATEGORIES,
  UNIT_SUGGESTIONS,
  nextCode,
  pickVisitFee,
  visitTypeOf,
  type ServiceCategory,
  type ServiceRow,
} from '@/lib/services';

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;
const CODE = /^[A-Za-z0-9_-]*$/;

/** Values a new service starts with (from "Set a fee" or a typed charge). */
export interface ServicePreset {
  name?: string;
  category?: ServiceCategory;
  type?: string;
  unitPrice?: number;
}

interface Form {
  name: string;
  category: ServiceCategory;
  unitPrice: string;
  unit: string;
  type: string;
  code: string;
  duration: string;
  description: string;
  notes: string;
}

type FieldKey = 'name' | 'unitPrice' | 'code' | 'duration';

function initialForm(row: ServiceRow | null, preset?: ServicePreset): Form {
  return {
    name: row?.name ?? preset?.name ?? '',
    category: row?.category ?? preset?.category ?? 'consultation',
    unitPrice: row ? String(row.unitPrice) : preset?.unitPrice !== undefined ? String(preset.unitPrice) : '',
    unit: row?.unit ?? ((preset?.category ?? 'consultation') === 'consultation' ? 'per visit' : 'per service'),
    // "Follow-up" typed by hand reads as the follow-up visit type, so the select shows it.
    type: visitTypeOf(row?.type ?? preset?.type) ?? row?.type ?? preset?.type ?? '',
    code: row?.code ?? '',
    duration: row?.duration ? String(row.duration) : '',
    description: row?.description ?? '',
    notes: row?.notes ?? '',
  };
}

function problems(f: Form): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (!f.name.trim()) out.name = 'Enter the service’s name, as it should read on the bill.';
  const price = Number(f.unitPrice);
  if (f.unitPrice.trim() === '') out.unitPrice = 'Enter the price. Use 0 for something that is free.';
  else if (!Number.isFinite(price) || price < 0) out.unitPrice = 'The price must be 0 or more.';
  if (!CODE.test(f.code.trim())) out.code = 'Use letters, numbers, - and _ only.';
  if (f.duration.trim() !== '' && !/^\d+$/.test(f.duration.trim())) out.duration = 'Whole minutes, or leave it blank.';
  return out;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="px-6 py-5">
      <h3 className="text-sm font-bold tracking-tight text-gray-900">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ServiceDialog({
  row,
  preset,
  rows,
  money,
  currency,
  onClose,
  onSaved,
}: {
  /** null = add a new service. */
  row: ServiceRow | null;
  preset?: ServicePreset;
  /** The whole price list, for clashes and for what the visit fee becomes. */
  rows: ServiceRow[];
  money: (n: number) => string;
  currency: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('The service couldn’t be saved');
  const [form, setForm] = useState<Form>(() => initialForm(row, preset));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | null>>>({});

  const editing = row !== null;
  const issues = tried ? problems(form) : {};
  const issueCount = Object.keys(issues).length;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const others = rows.filter((r) => r._id !== row?._id);
  const symbol = currencySymbol(currency);

  const sameName = form.name.trim() ? others.find((r) => r.name.trim().toLowerCase() === form.name.trim().toLowerCase()) : undefined;
  const codeTaken = form.code.trim() ? others.find((r) => r.code.toUpperCase() === form.code.trim().toUpperCase()) : undefined;
  const madeUpCode = nextCode(rows.map((r) => r.code), form.category);
  const price = Number(form.unitPrice);
  const priceChanged = editing && form.unitPrice.trim() !== '' && Number.isFinite(price) && price !== row.unitPrice;

  // What closing a visit of the chosen type bills once this is saved.
  const isConsult = form.category === 'consultation';
  const knownType = visitTypeOf(form.type);
  const legacyType = form.type && !knownType ? form.type : null;
  const feeNote = (() => {
    if (!isConsult || !knownType || !Number.isFinite(price)) return null;
    const label = visitTypeLabel(knownType).toLowerCase();
    const draft: ServiceRow = { ...(row ?? blankRow), name: form.name.trim() || 'This service', category: 'consultation', type: form.type, unitPrice: price, active: true };
    const before = pickVisitFee(rows, knownType);
    const after = pickVisitFee([...others, draft], knownType);
    if (!after || after.service !== draft) {
      return after ? { tone: 'amber' as const, text: `${after.service.name} (${money(after.service.unitPrice)}) is also set for ${label} visits and stays the one billed; the dearest wins.` } : null;
    }
    if (before && before.service._id !== row?._id) return { tone: 'gray' as const, text: `Closed ${label} visits will be billed this instead of ${before.service.name} (${money(before.service.unitPrice)}).` };
    if (!before) return { tone: 'gray' as const, text: `Closed ${label} visits will be billed this instead of the fixed ${money(FALLBACK_VISIT_FEE)}.` };
    return { tone: 'gray' as const, text: `Closed ${label} visits are billed this.` };
  })();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    const found = problems(form);
    const firstBad = (Object.keys(found) as FieldKey[])[0];
    if (firstBad) {
      refs.current[firstBad]?.focus();
      return;
    }
    setBusy(true);
    setError(null);

    const duration = form.duration.trim() === '' ? null : parseInt(form.duration, 10);
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      category: form.category,
      unitPrice: Math.round(price * 100) / 100,
      unit: form.unit.trim(),
      description: form.description.trim(),
      notes: form.notes.trim(),
    };
    if (form.code.trim()) body.code = form.code.trim().toUpperCase();
    // The visit type means something only for consultations; other categories leave it alone.
    if (isConsult) body.type = form.type;
    if (editing) body.duration = duration;
    else {
      if (duration !== null) body.duration = duration;
      for (const key of ['unit', 'description', 'notes', 'type'] as const) if (body[key] === '') delete body[key];
    }

    const result = await send(editing ? `/api/services/${row._id}` : '/api/services', editing ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = result.data as { name?: string; code?: string } | null;
    const name = saved?.name ?? form.name.trim();
    if (!editing) onSaved(`Added ${name} (${saved?.code ?? madeUpCode}) to the price list at ${money(price)}.`);
    else if (priceChanged) onSaved(`${name} now costs ${money(price)} (was ${money(row.unitPrice)}). Invoices already made keep the old price.`);
    else onSaved(`Saved ${name}.`);
  };

  const input = (key: FieldKey, label: ReactNode, { className: extra = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> = {}, optional = false) => (
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
        aria-invalid={!!issues[key]}
        aria-describedby={issues[key] ? `${ids}-${key}-err` : undefined}
        autoComplete="off"
        className={`${FIELD} ${issues[key] ? 'border-red-400' : ''} ${extra}`}
        {...props}
      />
      {issues[key] && <FieldError id={`${ids}-${key}-err`}>{issues[key]}</FieldError>}
    </div>
  );

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-2xl" labelledBy={`${ids}-title`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {editing ? row.name : 'Add a service'}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {editing ? (
              <>
                <span className="font-mono tabular-nums">{row.code}</span> · {row.active ? 'on the price list' : 'taken off the price list'}
              </>
            ) : (
              'Staff pick it from the price list when billing; the name and price go on the bill as written here.'
            )}
          </p>
        </div>

        <div className="divide-y divide-gray-100">
          <Section title="What it is">
            <div className="space-y-4">
              <div>
                {input('name', 'Name', { maxLength: 200, placeholder: 'e.g. Follow-up consultation' })}
                {sameName && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-sm text-amber-800">
                    <Svg d={ICON.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {sameName.active ? 'Already on the price list' : 'Already added and taken off the list'} as{' '}
                    <span className="font-mono tabular-nums">{sameName.code}</span> at {money(sameName.unitPrice)}.
                  </p>
                )}
              </div>
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-gray-700">Category</legend>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1 sm:grid-cols-3">
                  {SERVICE_CATEGORIES.map((c) => {
                    const on = form.category === c;
                    return (
                      <label
                        key={c}
                        className={`cursor-pointer rounded px-3 py-1.5 text-center text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal ${
                          on ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <input type="radio" name={`${ids}-category`} value={c} checked={on} onChange={() => set('category', c)} className="sr-only" />
                        {CATEGORY[c].label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </Section>

          <Section title="Price">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${ids}-unitPrice`}>Price</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-gray-500" aria-hidden="true">
                    {symbol}
                  </span>
                  <input
                    id={`${ids}-unitPrice`}
                    ref={(el) => {
                      refs.current.unitPrice = el;
                    }}
                    value={form.unitPrice}
                    onChange={(e) => set('unitPrice', e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={!!issues.unitPrice}
                    aria-describedby={issues.unitPrice ? `${ids}-unitPrice-err` : undefined}
                    className={`${FIELD} pl-8 font-mono tabular-nums ${issues.unitPrice ? 'border-red-400' : ''}`}
                  />
                </div>
                {issues.unitPrice && <FieldError id={`${ids}-unitPrice-err`}>{issues.unitPrice}</FieldError>}
              </div>
              <div>
                <Label htmlFor={`${ids}-unit`}>Charged</Label>
                <input
                  id={`${ids}-unit`}
                  value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}
                  list={`${ids}-units`}
                  maxLength={200}
                  autoComplete="off"
                  placeholder="per service"
                  className={FIELD}
                />
                <datalist id={`${ids}-units`}>
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>
            {priceChanged && (
              <p className="motion-panel-in mt-3 text-sm text-gray-600">
                Was <span className="font-mono tabular-nums">{money(row.unitPrice)}</span>. The new price applies to invoices made from now on; invoices already
                made keep theirs.
              </p>
            )}
          </Section>

          {isConsult && (
            <Section title="Billing a closed visit" hint="Closing a visit of this kind bills this consultation automatically.">
              <Label htmlFor={`${ids}-type`} optional>
                Kind of visit
              </Label>
              <select id={`${ids}-type`} value={form.type} onChange={(e) => set('type', e.target.value)} className={`${FIELD} sm:max-w-xs`}>
                <option value="">Not billed automatically</option>
                {VISIT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} visits
                  </option>
                ))}
                {legacyType && <option value={legacyType}>“{legacyType}” (not a kind of visit)</option>}
              </select>
              {legacyType && (
                <p className="mt-2 text-sm text-amber-800">“{legacyType}” doesn’t match any kind of visit, so it only bills when a visit’s kind appears in the name.</p>
              )}
              {feeNote && <p className={`mt-2 text-sm ${feeNote.tone === 'amber' ? 'text-amber-800' : 'text-gray-600'}`}>{feeNote.text}</p>}
            </Section>
          )}

          <Section title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                {input('code', 'Code', { maxLength: 50, placeholder: editing ? undefined : madeUpCode, className: 'font-mono uppercase' }, !editing)}
                {codeTaken ? (
                  <p className="mt-1.5 text-sm text-amber-800">
                    {codeTaken.name} already has this code.
                  </p>
                ) : (
                  !editing &&
                  !issues.code && (
                    <p className="mt-1.5 text-sm text-gray-500">
                      Left blank, it gets <span className="font-mono tabular-nums">{madeUpCode}</span>.
                    </p>
                  )
                )}
              </div>
              {input('duration', 'Usual length, in minutes', { inputMode: 'numeric', className: 'font-mono tabular-nums' }, true)}
            </div>
            <div className="mt-4">
              <Label htmlFor={`${ids}-description`} optional>
                Description
              </Label>
              <textarea id={`${ids}-description`} value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={5000} className={FIELD} />
            </div>
            <div className="mt-4">
              <Label htmlFor={`${ids}-notes`} optional>
                Notes for staff
              </Label>
              <textarea id={`${ids}-notes`} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={10000} className={FIELD} />
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || issueCount ? 'font-medium text-red-700' : 'text-gray-500'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ??
              (issueCount
                ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} fixing.`
                : busy
                  ? 'Saving…'
                  : 'Changes are recorded in the audit log.')}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to the price list'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

const blankRow: ServiceRow = {
  _id: '__draft__',
  code: '',
  name: '',
  description: null,
  category: 'consultation',
  type: null,
  unitPrice: 0,
  unit: 'per visit',
  duration: null,
  active: true,
  notes: null,
  createdAt: '',
  updatedAt: '',
  usage: null,
};

function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return '₱';
  }
}
