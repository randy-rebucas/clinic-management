'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { FieldError, Label, NoteArea, Section } from './visits/form/parts';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import { formatApiError } from './utils/apiError';
import { useMoney } from './invoices/shared';
import { qty } from './inventory/shared';
import { STOCK_CATEGORIES, type StockCategory } from '@/lib/inventory';

export interface InventoryFormItem {
  _id?: string;
  name: string;
  category: StockCategory;
  sku?: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  reorderQuantity: number;
  unitCost: number;
  supplier?: string;
  expiryDate?: string;
  location?: string;
  notes?: string;
  medicineId?: { _id: string; name: string; genericName?: string } | null;
}

interface Medicine {
  _id: string;
  name: string;
  genericName?: string;
  strength?: string;
  form?: string;
}

const UNITS = ['pieces', 'tablets', 'capsules', 'bottles', 'boxes', 'vials', 'ampoules', 'sachets', 'tubes', 'packs', 'rolls', 'pairs'];

type Field = 'name' | 'sku' | 'unit' | 'quantity' | 'reorderLevel' | 'reorderQuantity' | 'unitCost' | 'expiryDate';

const dateKey = (iso?: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');

/**
 * Add a stock item or change its details. Stock itself is only set here when the item is first
 * added (the opening stock); afterwards it changes through Restock and Adjust, so every change
 * has a line in the item's history and an edit can never overwrite stock dispensed meanwhile.
 */
export default function InventoryForm({ item, onCancel }: { item?: InventoryFormItem; onCancel: () => void }) {
  const ids = useId();
  const router = useRouter();
  const { money } = useMoney();
  const editing = Boolean(item?._id);

  const initial = {
    name: item?.name ?? '',
    category: item?.category ?? ('medicine' as StockCategory),
    sku: item?.sku ?? '',
    unit: item?.unit ?? 'pieces',
    quantity: item ? String(item.quantity) : '',
    reorderLevel: String(item?.reorderLevel ?? 10),
    reorderQuantity: String(item?.reorderQuantity ?? 50),
    unitCost: item?.unitCost ? String(item.unitCost) : '',
    expiryDate: dateKey(item?.expiryDate),
    supplier: item?.supplier ?? '',
    location: item?.location ?? '',
    notes: item?.notes ?? '',
  };
  const [f, setF] = useState(initial);
  const [medicine, setMedicine] = useState<InventoryFormItem['medicineId']>(item?.medicineId ?? null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (serverErrors[k as Field]) setServerErrors((e) => ({ ...e, [k]: undefined }));
  };

  const dirty = JSON.stringify(f) !== JSON.stringify(initial) || (medicine?._id ?? null) !== (item?.medicineId?._id ?? null);
  useUnsavedChanges(dirty && !busy, editing ? 'Your changes to this item are not saved. Leave anyway?' : 'This item is not saved yet. Leave anyway?');

  // --- Problems --------------------------------------------------------------

  const nonNeg = (s: string, label: string, required = false) => {
    if (s.trim() === '') return required ? `Enter the ${label}.` : null;
    const n = Number(s);
    return !Number.isFinite(n) || n < 0 ? `The ${label} can’t be negative.` : null;
  };
  const problems: Partial<Record<Field, string>> = {
    name: f.name.trim() ? undefined : 'Name the item.',
    unit: f.unit.trim() ? undefined : 'Say what it is counted in, e.g. tablets or boxes.',
    quantity: editing ? undefined : (nonNeg(f.quantity, 'stock on hand') ?? undefined),
    reorderLevel: nonNeg(f.reorderLevel, 'reorder level', true) ?? undefined,
    reorderQuantity: nonNeg(f.reorderQuantity, 'reorder quantity', true) ?? undefined,
    unitCost: nonNeg(f.unitCost, 'cost') ?? undefined,
    ...serverErrors,
  };
  const problemKeys = (Object.keys(problems) as Field[]).filter((k) => problems[k]);
  const err = (k: Field) => (attempted || serverErrors[k] ? problems[k] : undefined);

  const opening = Number(f.quantity) || 0;
  const level = Number(f.reorderLevel) || 0;

  // --- Submit -------------------------------------------------------------------

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemKeys.length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-inventory-form] [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailure(null);
    const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
    const body: Record<string, unknown> = {
      name: f.name.trim(),
      category: f.category,
      unit: f.unit.trim(),
      reorderLevel: num(f.reorderLevel),
      reorderQuantity: num(f.reorderQuantity),
      unitCost: num(f.unitCost),
      ...(f.sku.trim() ? { sku: f.sku.trim() } : {}),
      ...(f.supplier.trim() ? { supplier: f.supplier.trim() } : {}),
      ...(f.location.trim() ? { location: f.location.trim() } : {}),
      ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    };
    if (editing) {
      // Blank fields are sent so they can be cleared; stock is never sent from here.
      if (!f.sku.trim()) body.sku = '';
      if (!f.supplier.trim()) body.supplier = '';
      if (!f.location.trim()) body.location = '';
      if (!f.notes.trim()) body.notes = '';
      body.expiryDate = f.expiryDate || '';
      body.medicineId = f.category === 'medicine' && medicine ? medicine._id : null;
    } else {
      body.quantity = num(f.quantity);
      if (f.expiryDate) body.expiryDate = f.expiryDate;
      if (f.category === 'medicine' && medicine) body.medicineId = medicine._id;
    }

    try {
      const res = await fetch(editing ? `/api/inventory/${item!._id}` : '/api/inventory', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (res.status === 409 && /SKU/i.test(json?.error ?? '')) {
          setServerErrors({ sku: 'Another item already has this SKU.' });
          setFailure(null);
        } else {
          setFailure(formatApiError(json, editing ? 'The changes could not be saved' : 'The item could not be added'));
        }
        setBusy(false);
        return;
      }
      router.push(`/inventory/${json.data._id}?saved=${editing ? 'edited' : 'created'}`);
    } catch {
      setFailure('The server couldn’t be reached. Nothing was saved; try again.');
      setBusy(false);
    }
  };

  const status = busy
    ? 'Saving…'
    : attempted && problemKeys.length
      ? `${problemKeys.length === 1 ? 'One thing needs' : `${problemKeys.length} things need`} fixing.`
      : editing
        ? dirty
          ? 'Saving changes the item’s details. Stock stays as it is.'
          : 'No changes yet.'
        : f.name.trim()
          ? `Adds ${f.name.trim()} with ${qty(opening)} ${f.unit.trim() || 'units'} on hand${opening > 0 && opening <= level ? ', already at its reorder level' : ''}.`
          : 'Name the item to add it.';

  return (
    <form data-inventory-form onSubmit={submit} noValidate autoComplete="off" className="flex flex-col gap-6">
      {failure && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{failure}</p>
          <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      <Section id={`${ids}-item`} title="Item">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${ids}-name`}>Name</Label>
            <input
              id={`${ids}-name`}
              value={f.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={200}
              placeholder="e.g. Amoxicillin 500 mg capsule"
              autoFocus={!editing}
              aria-invalid={Boolean(err('name'))}
              className={`${FIELD} ${err('name') ? 'border-red-400' : ''}`}
            />
            {err('name') && <FieldError id={`${ids}-name-err`}>{err('name')}</FieldError>}
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Kind</legend>
            <div className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
              {STOCK_CATEGORIES.map((c) => (
                <label
                  key={c.value}
                  className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                >
                  <input type="radio" name={`${ids}-cat`} value={c.value} checked={f.category === c.value} onChange={() => set('category', c.value)} className="sr-only" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          {f.category === 'medicine' && <MedicineLink value={medicine ?? null} onChange={setMedicine} itemName={f.name} />}
          <div>
            <Label htmlFor={`${ids}-unit`}>Counted in</Label>
            <input
              id={`${ids}-unit`}
              value={f.unit}
              onChange={(e) => set('unit', e.target.value)}
              list={`${ids}-units`}
              maxLength={50}
              aria-invalid={Boolean(err('unit'))}
              className={`${FIELD} ${err('unit') ? 'border-red-400' : ''}`}
            />
            <datalist id={`${ids}-units`}>
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            {err('unit') ? <FieldError id={`${ids}-unit-err`}>{err('unit')}</FieldError> : <p className="mt-1.5 text-xs text-gray-500">The unit stock is dispensed and counted in.</p>}
          </div>
          <div>
            <Label htmlFor={`${ids}-sku`} optional>
              SKU
            </Label>
            <input
              id={`${ids}-sku`}
              value={f.sku}
              onChange={(e) => set('sku', e.target.value)}
              maxLength={200}
              aria-invalid={Boolean(err('sku'))}
              className={`${FIELD} font-mono ${err('sku') ? 'border-red-400' : ''}`}
            />
            {err('sku') && <FieldError id={`${ids}-sku-err`}>{err('sku')}</FieldError>}
          </div>
        </div>
      </Section>

      <Section id={`${ids}-stock`} title="Stock" hint="An alert goes out when stock falls to the reorder level, and again as it nears expiry.">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {editing ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-sm text-gray-700">
                On hand: <span className="font-mono font-semibold text-gray-900">{qty(item!.quantity)}</span> {item!.unit}.{' '}
                <span className="text-gray-500">Change it with Restock or Adjust on the</span>{' '}
                <Link href={`/inventory/${item!._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                  item’s page
                </Link>
                <span className="text-gray-500">, so the change is kept in its history.</span>
              </p>
            </div>
          ) : (
            <NumberField id={`${ids}-qty`} label="On hand now" optional value={f.quantity} onChange={(v) => set('quantity', v)} unit={f.unit} error={err('quantity')} hint="The opening stock. Leave empty if none yet." />
          )}
          <NumberField id={`${ids}-rl`} label="Reorder when down to" value={f.reorderLevel} onChange={(v) => set('reorderLevel', v)} unit={f.unit} error={err('reorderLevel')} />
          <NumberField id={`${ids}-rq`} label="Usually order" value={f.reorderQuantity} onChange={(v) => set('reorderQuantity', v)} unit={f.unit} error={err('reorderQuantity')} hint="Filled in when restocking." />
          <div>
            <Label htmlFor={`${ids}-cost`} optional>
              Cost per {f.unit.trim().replace(/s$/, '') || 'unit'}
            </Label>
            <input
              id={`${ids}-cost`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={f.unitCost}
              onChange={(e) => set('unitCost', e.target.value)}
              placeholder="0.00"
              aria-invalid={Boolean(err('unitCost'))}
              className={`${FIELD} text-right font-mono tabular-nums ${err('unitCost') ? 'border-red-400' : ''}`}
            />
            {err('unitCost') ? (
              <FieldError id={`${ids}-cost-err`}>{err('unitCost')}</FieldError>
            ) : (
              !editing && opening > 0 && Number(f.unitCost) > 0 && (
                <p className="mt-1.5 text-xs text-gray-500">
                  Stock worth <span className="font-mono">{money(opening * Number(f.unitCost))}</span> at cost.
                </p>
              )
            )}
          </div>
          <div>
            <Label htmlFor={`${ids}-exp`} optional>
              Expires
            </Label>
            <input id={`${ids}-exp`} type="date" value={f.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} className={`${FIELD} font-mono`} />
            <p className="mt-1.5 text-xs text-gray-500">{editing ? 'Clear it if this item doesn’t expire. Restocking a new batch updates it.' : 'The stock on hand’s expiry, from the box.'}</p>
          </div>
        </div>
      </Section>

      <Section id={`${ids}-where`} title="Where it comes from and where it is kept">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${ids}-sup`} optional>
              Supplier
            </Label>
            <input id={`${ids}-sup`} value={f.supplier} onChange={(e) => set('supplier', e.target.value)} maxLength={200} className={FIELD} />
          </div>
          <div>
            <Label htmlFor={`${ids}-loc`} optional>
              Kept in
            </Label>
            <input id={`${ids}-loc`} value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={200} placeholder="e.g. Pharmacy shelf B2, Fridge 1" className={FIELD} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${ids}-notes`} optional>
              Notes
            </Label>
            <NoteArea id={`${ids}-notes`} rows={2} value={f.notes} onChange={(v) => set('notes', v)} placeholder="e.g. Store below 25 °C" />
          </div>
        </div>
      </Section>

      <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${attempted && problemKeys.length && !busy ? 'font-medium text-red-700' : 'text-gray-600'}`} aria-live="polite">
          {status}
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm(editing ? 'Discard your changes?' : 'Discard this item?')) return;
              onCancel();
            }}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (editing && !dirty)}
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Svg d={ICON.check} />
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function NumberField({
  id,
  label,
  value,
  onChange,
  unit,
  error,
  hint,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          className={`${FIELD} text-right font-mono tabular-nums ${error ? 'border-red-400' : ''}`}
        />
        <span className="w-16 shrink-0 truncate text-sm text-gray-500">{unit.trim() || 'units'}</span>
      </div>
      {error ? <FieldError id={`${id}-err`}>{error}</FieldError> : hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/**
 * Link a medicine item to the clinic's medicine list, so dispensing that medicine takes stock off
 * this item even when the names are written differently.
 */
function MedicineLink({ value, onChange, itemName }: { value: InventoryFormItem['medicineId']; onChange: (m: InventoryFormItem['medicineId']) => void; itemName: string }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query === debounced) return;
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query, debounced]);

  const q = debounced.trim();
  const found = useKeyedFetch<Medicine[]>(!value && q.length >= 2 ? `/api/medicines?search=${encodeURIComponent(q)}` : null);
  const results = (found.value ?? []).slice(0, 8);
  const showList = open && !value && q.length >= 2;

  return (
    <div className="sm:col-span-2">
      <Label htmlFor={`${ids}-in`} optional>
        Medicine on the clinic’s list
      </Label>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-brand-teal-dark bg-white px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-gray-900">
            <span className="font-semibold">{value.name}</span>
            {value.genericName && value.genericName !== value.name && <span className="text-gray-500"> ({value.genericName})</span>}
          </span>
          <button type="button" onClick={() => onChange(null)} className={`shrink-0 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
            Unlink
          </button>
        </div>
      ) : (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Svg d={ICON.search} />
          </span>
          <input
            id={`${ids}-in`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${ids}-list`}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Search by brand or generic name"
            className={`${FIELD} pl-9`}
          />
          {showList && (
            <div className="motion-panel-in absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_30px_rgb(15,23,42,0.1)]">
              {results.length > 0 ? (
                <ul id={`${ids}-list`} role="listbox" aria-label="Matching medicines">
                  {results.map((m) => (
                    <li
                      key={m._id}
                      role="option"
                      aria-selected={false}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange({ _id: m._id, name: m.name, genericName: m.genericName });
                        setQuery('');
                      }}
                      className="cursor-pointer rounded-md px-3 py-2 hover:bg-brand-teal-light/60"
                    >
                      <span className="block text-sm font-semibold text-gray-900">{m.name}</span>
                      <span className="block text-xs text-gray-500">{[m.genericName, m.strength, m.form].filter(Boolean).join(' · ') || 'No details'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p id={`${ids}-list`} className="px-3 py-3 text-sm text-gray-500">
                  {found.loading ? 'Searching…' : found.error ? 'Medicine search is unavailable right now.' : `No medicine on the clinic’s list matches “${q}”.`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <p className="mt-1.5 text-xs text-gray-500">
        {value
          ? 'Dispensing this medicine takes stock off this item.'
          : `Without a link, dispensing takes stock off this item only when the prescribed name is exactly “${itemName.trim() || 'the item name'}”.`}
      </p>
    </div>
  );
}
