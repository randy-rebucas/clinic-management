'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import { qty, shortDate } from './shared';
import { ADJUST_REASON, ADJUST_REASONS, type AdjustReason } from '@/lib/inventory';

export interface StockItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  reorderQuantity: number;
  unitCost: number;
  supplier?: string;
  expiryDate?: string;
  category: string;
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function send(router: ReturnType<typeof useRouter>, itemId: string, body: Record<string, unknown>, fallback: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/inventory/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 401) {
      router.push('/login');
      return 'Your session ended. Sign in again.';
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return formatApiError(json, fallback);
    return null;
  } catch {
    return 'The server couldn’t be reached. Nothing changed; try again.';
  }
}

/**
 * Record a delivery. Quantity starts at the item's usual reorder quantity; cost and supplier at
 * what is on file. A batch expiry replaces an expired or empty one; an expired item's leftover
 * units can be taken off in the same step, so expired stock never hides inside the new count.
 */
export function RestockDialog({ item, onClose, onDone }: { item: StockItem; onClose: () => void; onDone: (message: string) => void }) {
  const ids = useId();
  const router = useRouter();
  const expired = Boolean(item.expiryDate && new Date(item.expiryDate) < new Date());
  const [amount, setAmount] = useState(item.reorderQuantity > 0 ? String(item.reorderQuantity) : '');
  const [cost, setCost] = useState(item.unitCost > 0 ? String(item.unitCost) : '');
  const [supplier, setSupplier] = useState(item.supplier ?? '');
  const [reference, setReference] = useState('');
  const [expiry, setExpiry] = useState('');
  const [discard, setDiscard] = useState(expired && item.quantity > 0);
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(amount);
  const amountProblem = amount.trim() === '' || !Number.isFinite(n) || n <= 0 ? 'Enter how much arrived.' : null;
  const c = cost.trim() === '' ? null : Number(cost);
  const costProblem = c !== null && (!Number.isFinite(c) || c < 0) ? 'Enter a cost of 0 or more.' : null;
  const expiryProblem = expiry && expiry <= todayKey() ? 'This batch would already be expired. Check the date.' : null;
  const problems = [amountProblem, costProblem, expiryProblem].filter(Boolean).length;
  const after = (discard ? 0 : item.quantity) + (amountProblem ? 0 : n);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problems) return;
    setBusy(true);
    setError(null);
    const failure = await send(
      router,
      item._id,
      {
        kind: 'restock',
        delta: n,
        ...(c !== null ? { unitCost: c } : {}),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(expiry ? { batchExpiry: expiry } : {}),
        ...(discard ? { discardExpired: true } : {}),
        ...(note.trim() ? { reason: note.trim() } : {}),
      },
      'The restock could not be recorded'
    );
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    onDone(`Restocked ${qty(n)} ${item.unit}${discard ? ` after taking off ${qty(item.quantity)} expired` : ''}. ${qty(after)} ${item.unit} on hand.`);
  };

  return (
    <Frame title="Restock" subtitle={item.name} onClose={onClose} busy={busy} labelId={`${ids}-t`}>
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${ids}-q`}>Quantity received</Label>
            <div className="flex items-center gap-2">
              <input
                id={`${ids}-q`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={Boolean(attempted && amountProblem)}
                className={`${FIELD} text-right font-mono tabular-nums ${attempted && amountProblem ? 'border-red-400' : ''}`}
              />
              <span className="shrink-0 text-sm text-gray-500">{item.unit}</span>
            </div>
            {attempted && amountProblem ? <Problem>{amountProblem}</Problem> : item.reorderQuantity > 0 && <Hint>Usually ordered: <span className="font-mono">{qty(item.reorderQuantity)}</span></Hint>}
          </div>
          <div>
            <Label htmlFor={`${ids}-c`} optional>
              Cost per {item.unit.replace(/s$/, '') || 'unit'}
            </Label>
            <input
              id={`${ids}-c`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              aria-invalid={Boolean(costProblem)}
              className={`${FIELD} text-right font-mono tabular-nums ${costProblem ? 'border-red-400' : ''}`}
            />
            {costProblem ? <Problem>{costProblem}</Problem> : <Hint>Becomes the item’s unit cost.</Hint>}
          </div>
          <div>
            <Label htmlFor={`${ids}-e`} optional>
              This batch expires
            </Label>
            <input id={`${ids}-e`} type="date" value={expiry} min={todayKey()} onChange={(e) => setExpiry(e.target.value)} aria-invalid={Boolean(expiryProblem)} className={`${FIELD} font-mono ${expiryProblem ? 'border-red-400' : ''}`} />
            {expiryProblem ? (
              <Problem>{expiryProblem}</Problem>
            ) : (
              <Hint>
                {item.expiryDate && !expired && item.quantity > 0
                  ? `The item keeps the earlier date, ${shortDate(item.expiryDate)}, until that stock is gone.`
                  : item.category === 'medicine'
                    ? 'From the box. Medicines are flagged before they expire.'
                    : 'Leave empty if it doesn’t expire.'}
              </Hint>
            )}
          </div>
          <div>
            <Label htmlFor={`${ids}-s`} optional>
              Supplier
            </Label>
            <input id={`${ids}-s`} value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={200} className={FIELD} />
          </div>
          <div>
            <Label htmlFor={`${ids}-r`} optional>
              Delivery or order number
            </Label>
            <input id={`${ids}-r`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" className={`${FIELD} font-mono`} />
          </div>
          <div>
            <Label htmlFor={`${ids}-n`} optional>
              Note
            </Label>
            <input id={`${ids}-n`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Batch 24K031" className={FIELD} />
          </div>
          {expired && item.quantity > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 sm:col-span-2">
              <input type="checkbox" checked={discard} onChange={(e) => setDiscard(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-brand-teal-dark" />
              <span>
                Take off the <span className="font-mono font-semibold">{qty(item.quantity)}</span> {item.unit} that expired on {shortDate(item.expiryDate!)} first. They are recorded as thrown away.
              </span>
            </label>
          )}
        </div>
        <Footer
          status={error ?? (attempted && problems ? `${problems === 1 ? 'One thing needs' : `${problems} things need`} fixing.` : amountProblem ? 'Enter the quantity received.' : `${qty(item.quantity)} → ${qty(after)} ${item.unit} on hand.`)}
          bad={Boolean(error || (attempted && problems))}
          busy={busy}
          onClose={onClose}
          label={busy ? 'Recording…' : 'Record restock'}
        />
      </form>
    </Frame>
  );
}

type AdjustMode = 'out' | 'in' | 'count';

/**
 * Change stock for anything other than a delivery: used, damaged, expired and thrown away,
 * returned, found, or a physical count. Every change carries a reason, and "used in the clinic"
 * counts towards the item's daily use.
 */
export function AdjustDialog({
  item,
  initial,
  onClose,
  onDone,
}: {
  item: StockItem;
  initial?: { mode: AdjustMode; reason?: AdjustReason; amount?: number };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const router = useRouter();
  const [mode, setMode] = useState<AdjustMode>(initial?.mode ?? 'out');
  const [reason, setReason] = useState<AdjustReason>(initial?.reason ?? 'used');
  const [amount, setAmount] = useState(initial?.amount !== undefined ? String(initial.amount) : '');
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = ADJUST_REASONS.filter((r) => ADJUST_REASON[r].direction === 'either' || ADJUST_REASON[r].direction === mode);
  const n = Number(amount);
  const amountProblem =
    amount.trim() === '' || !Number.isFinite(n) || n < 0 || (mode !== 'count' && n === 0)
      ? mode === 'count'
        ? 'Enter how many you counted.'
        : 'Enter an amount above 0.'
      : mode === 'out' && n > item.quantity
        ? `Only ${qty(item.quantity)} ${item.unit} on hand.`
        : mode === 'count' && n === item.quantity
          ? 'That is already the stock on record.'
          : null;
  const noteProblem = reason === 'other' && mode !== 'count' && !note.trim() ? 'Say what happened.' : null;
  const problems = [amountProblem, noteProblem].filter(Boolean).length;
  const after = amountProblem ? null : mode === 'out' ? item.quantity - n : mode === 'in' ? item.quantity + n : n;

  const switchMode = (m: AdjustMode) => {
    setMode(m);
    if (m !== 'count' && ADJUST_REASON[reason].direction !== 'either' && ADJUST_REASON[reason].direction !== m) setReason(m === 'out' ? 'used' : 'found');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problems) return;
    setBusy(true);
    setError(null);
    const body =
      mode === 'count'
        ? { kind: 'count', quantity: n, ...(note.trim() ? { reason: note.trim() } : {}) }
        : { kind: 'adjustment', delta: mode === 'out' ? -n : n, reasonCode: reason, ...(note.trim() ? { reason: note.trim() } : {}) };
    const failure = await send(router, item._id, body, 'The change could not be recorded');
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    onDone(
      mode === 'count'
        ? `Stock counted: ${qty(n)} ${item.unit} (was ${qty(item.quantity)}).`
        : `${mode === 'out' ? 'Took off' : 'Added'} ${qty(n)} ${item.unit} (${ADJUST_REASON[reason].label.toLowerCase()}). ${qty(after ?? 0)} ${item.unit} on hand.`
    );
  };

  const MODES: { value: AdjustMode; label: string }[] = [
    { value: 'out', label: 'Take off' },
    { value: 'in', label: 'Add' },
    { value: 'count', label: 'Count' },
  ];

  return (
    <Frame title="Adjust stock" subtitle={`${item.name} · ${qty(item.quantity)} ${item.unit} on hand`} onClose={onClose} busy={busy} labelId={`${ids}-t`}>
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 px-6 py-5">
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Change</legend>
            <div className="inline-flex gap-1 rounded-md border border-gray-300 bg-white p-1">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                >
                  <input type="radio" name={`${ids}-mode`} value={m.value} checked={mode === m.value} onChange={() => switchMode(m.value)} className="sr-only" />
                  {m.label}
                </label>
              ))}
            </div>
            <Hint>{mode === 'count' ? 'Set the stock to what is actually on the shelf.' : mode === 'out' ? 'Stock that left other than by dispensing.' : 'Stock that turned up other than in a delivery. Use Restock for deliveries.'}</Hint>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${ids}-q`}>{mode === 'count' ? 'Counted' : mode === 'out' ? 'Amount taken off' : 'Amount added'}</Label>
              <div className="flex items-center gap-2">
                <input
                  id={`${ids}-q`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={Boolean((attempted || amount) && amountProblem)}
                  className={`${FIELD} text-right font-mono tabular-nums ${(attempted || amount) && amountProblem ? 'border-red-400' : ''}`}
                />
                <span className="shrink-0 text-sm text-gray-500">{item.unit}</span>
              </div>
              {(attempted || amount) && amountProblem && <Problem>{amountProblem}</Problem>}
            </div>
            {mode !== 'count' && (
              <div>
                <Label htmlFor={`${ids}-r`}>Why</Label>
                <select id={`${ids}-r`} value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)} className={FIELD}>
                  {reasons.map((r) => (
                    <option key={r} value={r}>
                      {ADJUST_REASON[r].label}
                    </option>
                  ))}
                </select>
                {reason === 'used' && <Hint>Counts towards how fast this item is used.</Hint>}
              </div>
            )}
          </div>
          <div>
            <Label htmlFor={`${ids}-n`} optional={!(reason === 'other' && mode !== 'count')}>
              Note
            </Label>
            <input
              id={`${ids}-n`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder={mode === 'count' ? 'e.g. Monthly count' : reason === 'damaged' ? 'e.g. Box crushed in delivery' : ''}
              aria-invalid={Boolean(attempted && noteProblem)}
              className={`${FIELD} ${attempted && noteProblem ? 'border-red-400' : ''}`}
            />
            {attempted && noteProblem && <Problem>{noteProblem}</Problem>}
          </div>
        </div>
        <Footer
          status={error ?? (attempted && problems ? `${problems === 1 ? 'One thing needs' : 'Two things need'} fixing.` : after === null ? 'Every change is kept in the item’s history.' : `${qty(item.quantity)} → ${qty(after)} ${item.unit} on hand.`)}
          bad={Boolean(error || (attempted && problems))}
          busy={busy}
          onClose={onClose}
          label={busy ? 'Recording…' : mode === 'count' ? 'Record count' : 'Record change'}
        />
      </form>
    </Frame>
  );
}

// ---------------------------------------------------------------------------

function Frame({ title, subtitle, labelId, busy, onClose, children }: { title: string; subtitle: string; labelId: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-xl" labelledBy={labelId}>
      <div className="border-b border-gray-200 px-6 py-5">
        <h2 id={labelId} className="text-lg font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </div>
      {children}
    </Modal>
  );
}

function Footer({ status, bad, busy, onClose, label }: { status: string; bad: boolean; busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className={`text-sm ${bad ? 'font-medium text-red-700' : 'text-gray-600'}`} role={bad ? 'alert' : undefined} aria-live="polite">
        {status}
      </p>
      <div className="flex shrink-0 justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
        >
          <Svg d={ICON.check} />
          {label}
        </button>
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-500">{children}</p>;
}

function Problem({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-sm font-medium text-red-700">{children}</p>;
}
