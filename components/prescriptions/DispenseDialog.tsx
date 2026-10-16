'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { medicineDirections } from './shared';

interface Medicine {
  name: string;
  dose?: string;
  frequency?: string;
  durationDays?: number;
  quantity?: number;
}

/**
 * Record what the patient takes home now, medicine by medicine. Each row starts at what is
 * still to give, so the usual case (everything) is one click; lower a number to give part.
 */
export default function DispenseDialog({
  prescriptionId,
  medications,
  given,
  onClose,
  onDone,
}: {
  prescriptionId: string;
  medications: Medicine[];
  /** Already dispensed, per medication index. */
  given: number[];
  onClose: () => void;
  onDone: (warnings: string[]) => void;
}) {
  const ids = useId();
  const router = useRouter();
  const prescribed = medications.map((m) => Math.max(0, Number(m.quantity) || 0));
  const remaining = prescribed.map((q, i) => Math.max(0, q - (given[i] ?? 0)));
  const [qty, setQty] = useState<string[]>(() => remaining.map((r) => (r > 0 ? String(r) : '')));
  const [where, setWhere] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A medicine with a quantity that is all given is shown but can't take more.
  const open = medications.map((_, i) => prescribed[i] === 0 || remaining[i] > 0);
  const problems = qty.map((raw, i) => {
    if (!open[i] || raw.trim() === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return 'Whole numbers only.';
    if (prescribed[i] > 0 && n > remaining[i]) return `Only ${remaining[i]} left to give.`;
    return null;
  });
  const items = qty
    .map((raw, i) => ({ medicationIndex: i, quantity: open[i] ? Number(raw) || 0 : 0 }))
    .filter((it, i) => !problems[i] && Number.isInteger(it.quantity) && it.quantity > 0);
  const problemCount = problems.filter(Boolean).length;
  const nothing = items.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0 || nothing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, pharmacyName: where.trim() || undefined, trackingNumber: reference.trim() || undefined, notes: notes.trim() || undefined }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'The dispense could not be recorded'));
        return;
      }
      onDone(Array.isArray(json.warnings) ? json.warnings : []);
    } catch {
      setError('The server couldn’t be reached. Nothing was recorded; try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-2xl" labelledBy={`${ids}-title`}>
      <form onSubmit={submit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            Dispense medicines
          </h2>
          <p className="mt-1 text-sm text-gray-600">Enter what the patient takes home now. Medicines the clinic stocks are taken off inventory.</p>
        </div>

        <ul className="divide-y divide-gray-100">
          {medications.map((m, i) => {
            const id = `${ids}-q${i}`;
            const err = attempted || qty[i].trim() !== '' ? problems[i] : null;
            const directions = medicineDirections(m);
            return (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-4 px-6 py-3">
                <div className="min-w-0">
                  <label htmlFor={id} className="block font-semibold text-gray-900">
                    {m.name}
                  </label>
                  {directions && <p className="truncate text-sm text-gray-500">{directions}</p>}
                  <p className="mt-0.5 text-sm text-gray-600">
                    {prescribed[i] > 0 ? (
                      remaining[i] > 0 ? (
                        <>
                          <span className="font-mono tabular-nums">{remaining[i]}</span> of <span className="font-mono tabular-nums">{prescribed[i]}</span> left to give
                        </>
                      ) : (
                        <>
                          All <span className="font-mono tabular-nums">{prescribed[i]}</span> given
                        </>
                      )
                    ) : (
                      <>
                        No quantity on the prescription
                        {given[i] > 0 && (
                          <>
                            {' · '}
                            <span className="font-mono tabular-nums">{given[i]}</span> given so far
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={prescribed[i] > 0 ? remaining[i] : undefined}
                    step={1}
                    value={qty[i]}
                    disabled={!open[i]}
                    placeholder={open[i] ? '0' : '—'}
                    onChange={(e) => setQty((q) => q.map((v, j) => (j === i ? e.target.value : v)))}
                    aria-invalid={Boolean(err)}
                    aria-describedby={err ? `${id}-err` : undefined}
                    className={`${FIELD} text-right font-mono tabular-nums ${err ? 'border-red-400' : ''}`}
                  />
                  {err && (
                    <p id={`${id}-err`} className="mt-1 text-right text-xs font-medium text-red-700">
                      {err}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="grid gap-4 border-t border-gray-200 px-6 py-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-where`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Given at <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input id={`${ids}-where`} value={where} onChange={(e) => setWhere(e.target.value)} maxLength={200} placeholder="This clinic" className={FIELD} />
          </div>
          <div>
            <label htmlFor={`${ids}-ref`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Reference number <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input id={`${ids}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} className={`${FIELD} font-mono`} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-notes`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Note <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <textarea id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Generic given in place of the brand" className={`${FIELD} resize-y`} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || (attempted && (problemCount > 0 || nothing)) ? 'font-medium text-red-700' : 'text-gray-600'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ??
              (attempted && problemCount > 0
                ? `${problemCount === 1 ? 'One quantity needs' : `${problemCount} quantities need`} fixing.`
                : attempted && nothing
                  ? 'Enter a quantity for at least one medicine.'
                  : nothing
                    ? 'Nothing entered yet.'
                    : `${items.length} of ${medications.length} ${medications.length === 1 ? 'medicine' : 'medicines'} in this dispense.`)}
          </p>
          <div className="flex justify-end gap-2">
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
              {busy ? 'Recording…' : 'Record dispense'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
