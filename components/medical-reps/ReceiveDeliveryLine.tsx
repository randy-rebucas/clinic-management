'use client';

import { useEffect, useId, useState } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { MedicineLink, UNITS, type InventoryFormItem } from '../InventoryForm';

export interface StockItemRef {
  _id: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface ReceivableLine {
  productName: string;
  strength?: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  expiryDate?: string;
  packSize?: { count: number; unit: string };
  remembered?: { item: StockItemRef; unitsPerPack: number } | null;
  stockMatches?: StockItemRef[];
}

/** One line's answer, kept as typed until the clinic confirms. */
export interface LineChoice {
  receivedQuantity: string;
  target: 'none' | 'existing' | 'new';
  item: StockItemRef | null;
  unitsPerPack: string;
  /** The clinic typed a conversion; stop suggesting one. */
  unitsTouched: boolean;
  create: { name: string; unit: string; medicine: InventoryFormItem['medicineId']; reorderLevel: string; unitCost: string; location: string };
}

const productLabel = (l: Pick<ReceivableLine, 'productName' | 'strength'>) => [l.productName, l.strength].filter(Boolean).join(' ');
const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * How many stock units one delivered unit holds: the clinic's own answer from last time for this
 * item, 1 when the units are the same, else the product's pack size when it's in the item's unit.
 */
export function suggestUnitsPerPack(line: ReceivableLine, targetUnit: string, itemId?: string): number {
  if (line.remembered && line.remembered.item._id === itemId) return line.remembered.unitsPerPack;
  if (same(line.unit, targetUnit)) return 1;
  if (line.packSize && same(line.packSize.unit, targetUnit)) return line.packSize.count;
  return 1;
}

/**
 * Where a delivery line starts: samples outside stock (they go to doctors, not the shelf);
 * a delivery into the item used last time, else the closest name match, else a new item.
 */
export function initialChoice(kind: 'sample' | 'delivery', line: ReceivableLine): LineChoice {
  const item = line.remembered?.item ?? line.stockMatches?.[0] ?? null;
  const target: LineChoice['target'] = kind === 'sample' ? 'none' : item ? 'existing' : 'new';
  const createUnit = line.packSize?.unit || line.unit;
  const targetUnit = target === 'existing' && item ? item.unit : createUnit;
  return {
    receivedQuantity: String(line.quantity),
    target,
    item,
    unitsPerPack: String(suggestUnitsPerPack(line, targetUnit, target === 'existing' ? item?._id : undefined)),
    unitsTouched: false,
    create: { name: productLabel(line), unit: createUnit, medicine: null, reorderLevel: '10', unitCost: '', location: '' },
  };
}

/** What the API takes for this line. */
export function choiceToBody(c: LineChoice) {
  const receivedQuantity = Math.max(0, Math.floor(Number(c.receivedQuantity) || 0));
  const unitsPerPack = Math.max(1, Math.floor(Number(c.unitsPerPack) || 1));
  if (c.target === 'existing' && c.item) return { receivedQuantity, unitsPerPack, stock: { itemId: c.item._id } };
  if (c.target === 'new') {
    const num = (s: string) => (s.trim() === '' ? undefined : Math.max(0, Number(s) || 0));
    return {
      receivedQuantity,
      unitsPerPack,
      stock: {
        create: {
          name: c.create.name.trim(),
          unit: c.create.unit.trim(),
          ...(c.create.medicine ? { medicineId: c.create.medicine._id } : {}),
          ...(num(c.create.reorderLevel) !== undefined ? { reorderLevel: num(c.create.reorderLevel) } : {}),
          ...(num(c.create.unitCost) !== undefined ? { unitCost: num(c.create.unitCost) } : {}),
          ...(c.create.location.trim() ? { location: c.create.location.trim() } : {}),
        },
      },
    };
  }
  return { receivedQuantity, unitsPerPack: 1, stock: 'none' as const };
}

/** A line that can't be sent yet, in words; null when it can. */
export function choiceProblem(c: LineChoice): string | null {
  if (!/^\d+$/.test(c.receivedQuantity.trim())) return 'Enter the quantity you received.';
  if (c.target === 'existing' && !c.item) return 'Choose the stock item.';
  if (c.target === 'new' && (!c.create.name.trim() || !c.create.unit.trim())) return 'Name the new item and what it is counted in.';
  if (c.target !== 'none' && !(Number(c.unitsPerPack) >= 1 && Number.isInteger(Number(c.unitsPerPack)))) return 'The conversion is a whole number of 1 or more.';
  return null;
}

const TARGETS: { key: LineChoice['target']; label: string }[] = [
  { key: 'none', label: 'Don’t add to stock' },
  { key: 'existing', label: 'Add to a stock item' },
  { key: 'new', label: 'New stock item' },
];

/**
 * Receive one delivered product: what arrived, where it goes in stock (an existing item, found by
 * search, or a new one with the essentials of /inventory/new), and how delivered units convert to
 * the unit the clinic counts and dispenses in.
 */
export function ReceiveDeliveryLine({ line, value, onChange }: { line: ReceivableLine; value: LineChoice; onChange: (c: LineChoice) => void }) {
  const ids = useId();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const found = useKeyedFetch<StockItemRef[]>(searching && debounced.length >= 2 ? `/api/inventory?search=${encodeURIComponent(debounced)}&page=1&limit=8&sort=name` : null);

  const targetUnit = value.target === 'existing' ? value.item?.unit ?? '' : value.create.unit;
  const units = Number(value.receivedQuantity) * Number(value.unitsPerPack);

  /** Change the target; the conversion follows it until the clinic types one. */
  const retarget = (patch: Partial<LineChoice>) => {
    const next = { ...value, ...patch };
    if (!next.unitsTouched) {
      const unit = next.target === 'existing' ? next.item?.unit ?? '' : next.create.unit;
      next.unitsPerPack = String(suggestUnitsPerPack(line, unit, next.target === 'existing' ? next.item?._id : undefined));
    }
    onChange(next);
  };
  const pick = (item: StockItemRef) => {
    setSearching(false);
    setQuery('');
    retarget({ target: 'existing', item });
  };
  const quickPicks = [line.remembered?.item, ...(line.stockMatches ?? [])].filter(
    (x, i, all): x is StockItemRef => !!x && all.findIndex((y) => y?._id === x._id) === i
  );

  return (
    <fieldset className="rounded-md border border-gray-200 p-3">
      <legend className="px-1 text-sm font-semibold text-gray-900">{productLabel(line)}</legend>
      <p className="text-xs text-gray-500">
        Recorded: {line.quantity} {line.unit}
        {line.packSize ? ` of ${line.packSize.count} ${line.packSize.unit}` : ''}
        {line.lotNumber ? ` · lot ${line.lotNumber}` : ''}
        {line.expiryDate ? ` · expires ${line.expiryDate.slice(0, 10)}` : ''}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[9rem_1fr]">
        <div>
          <Label htmlFor={`${ids}-qty`}>Received ({line.unit})</Label>
          <input
            id={`${ids}-qty`}
            type="number"
            min={0}
            max={100000}
            inputMode="numeric"
            value={value.receivedQuantity}
            onChange={(e) => onChange({ ...value, receivedQuantity: e.target.value })}
            className={`${FIELD} font-mono`}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Stock</span>
          <div role="radiogroup" aria-label={`Stock for ${productLabel(line)}`} className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
            {TARGETS.map((t) => (
              <label
                key={t.key}
                className="cursor-pointer rounded px-3 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal"
              >
                <input
                  type="radio"
                  name={`${ids}-target`}
                  checked={value.target === t.key}
                  onChange={() => retarget({ target: t.key })}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {value.target === 'existing' && (
        <div className="mt-3">
          {value.item && !searching ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-brand-teal-dark bg-white px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-gray-900">{value.item.name}</span>{' '}
                <span className="text-gray-500">
                  · <span className="font-mono">{value.item.quantity}</span> {value.item.unit} on hand
                  {line.remembered?.item._id === value.item._id ? ' · used last time' : ''}
                </span>
              </span>
              <button type="button" onClick={() => setSearching(true)} className={`shrink-0 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Change
              </button>
            </div>
          ) : (
            <div>
              <Label htmlFor={`${ids}-find`}>Find the stock item</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Svg d={ICON.search} />
                </span>
                <input
                  id={`${ids}-find`}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearching(true);
                  }}
                  onFocus={() => setSearching(true)}
                  placeholder="Search your inventory by name or SKU"
                  className={`${FIELD} pl-9`}
                />
              </div>
              <ul className="mt-2 flex flex-col gap-1" aria-label="Stock items">
                {(debounced.length >= 2 ? found.value ?? [] : quickPicks).map((item) => (
                  <li key={item._id}>
                    <button
                      type="button"
                      onClick={() => pick(item)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                    >
                      <span className="font-semibold text-gray-900">{item.name}</span>{' '}
                      <span className="text-gray-500">
                        · <span className="font-mono">{item.quantity}</span> {item.unit}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {debounced.length >= 2 && !found.loading && !(found.value ?? []).length && (
                <p className="mt-1 text-sm text-gray-500">No stock item matches “{debounced}”. Choose New stock item to add it.</p>
              )}
            </div>
          )}
        </div>
      )}

      {value.target === 'new' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${ids}-name`}>Name</Label>
            <input
              id={`${ids}-name`}
              value={value.create.name}
              onChange={(e) => onChange({ ...value, create: { ...value.create, name: e.target.value } })}
              maxLength={200}
              className={FIELD}
            />
          </div>
          <MedicineLink
            value={value.create.medicine}
            onChange={(medicine) => onChange({ ...value, create: { ...value.create, medicine } })}
            itemName={value.create.name}
          />
          <div>
            <Label htmlFor={`${ids}-unit`}>Counted in</Label>
            <input
              id={`${ids}-unit`}
              value={value.create.unit}
              onChange={(e) => retarget({ create: { ...value.create, unit: e.target.value } })}
              list={`${ids}-units`}
              maxLength={50}
              className={FIELD}
            />
            <datalist id={`${ids}-units`}>
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <p className="mt-1.5 text-xs text-gray-500">The unit you dispense and count it in.</p>
          </div>
          <div>
            <Label htmlFor={`${ids}-rl`}>Reorder when down to</Label>
            <input
              id={`${ids}-rl`}
              type="number"
              min={0}
              inputMode="decimal"
              value={value.create.reorderLevel}
              onChange={(e) => onChange({ ...value, create: { ...value.create, reorderLevel: e.target.value } })}
              className={`${FIELD} text-right font-mono`}
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-cost`} optional>
              Cost per {value.create.unit.trim().replace(/s$/, '') || 'unit'}
            </Label>
            <input
              id={`${ids}-cost`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={value.create.unitCost}
              onChange={(e) => onChange({ ...value, create: { ...value.create, unitCost: e.target.value } })}
              placeholder="0.00"
              className={`${FIELD} text-right font-mono`}
            />
          </div>
          <div>
            <Label htmlFor={`${ids}-loc`} optional>
              Kept in
            </Label>
            <input
              id={`${ids}-loc`}
              value={value.create.location}
              onChange={(e) => onChange({ ...value, create: { ...value.create, location: e.target.value } })}
              maxLength={200}
              placeholder="e.g. Pharmacy shelf B2"
              className={FIELD}
            />
          </div>
        </div>
      )}

      {value.target !== 'none' && targetUnit.trim() && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <label htmlFor={`${ids}-conv`}>1 {line.unit.replace(/s$/, '')} =</label>
          <input
            id={`${ids}-conv`}
            type="number"
            min={1}
            inputMode="numeric"
            value={value.unitsPerPack}
            onChange={(e) => onChange({ ...value, unitsPerPack: e.target.value, unitsTouched: true })}
            className={`${FIELD} w-24 text-right font-mono`}
          />
          <span>{targetUnit}</span>
          {Number.isFinite(units) && units > 0 && (
            <span className="ml-auto font-medium text-gray-900">
              Adds <span className="font-mono">{units}</span> {targetUnit}
            </span>
          )}
        </div>
      )}
    </fieldset>
  );
}
