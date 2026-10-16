'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import { useSetting } from '../SettingsContext';
import { PAYMENT_METHODS, type PaymentMethod } from './shared';
import { roundMoney } from '@/lib/invoice-totals';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Record money received against an invoice. The amount starts at the whole balance, so paying in
 * full is one click; lower it for a part payment (when the clinic allows them). For cash, the
 * amount handed over gives the change to return; it is not stored.
 */
export default function PaymentDialog({
  invoiceId,
  invoiceNumber,
  balance,
  money,
  onClose,
  onDone,
}: {
  invoiceId: string;
  invoiceNumber: string;
  balance: number;
  money: (v: number) => string;
  onClose: () => void;
  onDone: (paid: number, newBalance: number) => void;
}) {
  const ids = useId();
  const router = useRouter();
  const allowPartial = (useSetting('billingSettings.allowPartialPayments', true) as boolean | undefined) !== false;
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [date, setDate] = useState(todayKey);
  const [notes, setNotes] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = roundMoney(Number(amount));
  const amountProblem =
    amount.trim() === '' || !Number.isFinite(Number(amount)) || value <= 0
      ? 'Enter the amount received.'
      : value > balance + 0.005
        ? `That is more than the ${money(balance)} still to pay.`
        : !allowPartial && Math.abs(value - balance) > 0.005
          ? `This clinic takes payment in full only: ${money(balance)}.`
          : null;
  const dateProblem = date > todayKey() ? 'A payment can’t be dated in the future.' : null;
  const tenderedValue = Number(tendered);
  const change = method === 'cash' && tendered.trim() !== '' && Number.isFinite(tenderedValue) && !amountProblem ? roundMoney(tenderedValue - value) : null;
  const ref = PAYMENT_METHODS.find((m) => m.value === method)!.reference;
  const problemCount = (amountProblem ? 1 : 0) + (dateProblem ? 1 : 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0) return;
    setBusy(true);
    setError(null);
    try {
      // A date picked as today keeps the time of day; an earlier day is recorded at noon.
      const when = date === todayKey() ? new Date() : new Date(`${date}T12:00:00`);
      const res = await fetch(`/api/invoices/${invoiceId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method,
          amount: value,
          date: when.toISOString(),
          referenceNo: ref && reference.trim() ? reference.trim() : undefined,
          receiptNo: receiptNo.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(formatApiError(json, 'The payment could not be recorded'));
        return;
      }
      onDone(value, Number(json.data?.outstandingBalance ?? roundMoney(balance - value)));
    } catch {
      setError('The server couldn’t be reached. Nothing was recorded; try again.');
    } finally {
      setBusy(false);
    }
  };

  const showAmountProblem = attempted || amount.trim() !== '' ? amountProblem : null;

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-xl" labelledBy={`${ids}-title`}>
      <form onSubmit={submit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            Record a payment
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-mono">{invoiceNumber}</span> · <span className="font-mono text-gray-900">{money(balance)}</span> still to pay
          </p>
        </div>

        <div className="grid gap-5 px-6 py-5">
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Paid by</legend>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1 sm:grid-cols-4">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className="cursor-pointer rounded px-2 py-1.5 text-center text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                >
                  <input type="radio" name={`${ids}-method`} value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="sr-only" />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${ids}-amount`}>Amount received</Label>
              <input
                id={`${ids}-amount`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={Boolean(showAmountProblem)}
                aria-describedby={showAmountProblem ? `${ids}-amount-err` : `${ids}-amount-hint`}
                className={`${FIELD} text-right font-mono tabular-nums ${showAmountProblem ? 'border-red-400' : ''}`}
              />
              {showAmountProblem ? (
                <p id={`${ids}-amount-err`} className="mt-1.5 text-sm font-medium text-red-700">
                  {showAmountProblem}
                </p>
              ) : (
                <p id={`${ids}-amount-hint`} className="mt-1.5 text-xs text-gray-500">
                  {value > 0 && value < balance - 0.005 ? (
                    <>
                      Part payment; <span className="font-mono">{money(roundMoney(balance - value))}</span> will still be due.
                    </>
                  ) : (
                    'Pays the invoice in full.'
                  )}
                </p>
              )}
            </div>
            {method === 'cash' ? (
              <div>
                <Label htmlFor={`${ids}-tendered`} optional>
                  Cash handed over
                </Label>
                <input
                  id={`${ids}-tendered`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  aria-describedby={`${ids}-change`}
                  className={`${FIELD} text-right font-mono tabular-nums`}
                />
                <p id={`${ids}-change`} className="mt-1.5 text-xs text-gray-500" aria-live="polite">
                  {change === null ? 'To work out the change.' : change < 0 ? (
                    <span className="font-medium text-red-700">
                      <span className="font-mono">{money(-change)}</span> short of the amount received.
                    </span>
                  ) : (
                    <>
                      Change to give: <span className="font-mono font-semibold text-gray-900">{money(change)}</span>
                    </>
                  )}
                </p>
              </div>
            ) : (
              ref && (
                <div>
                  <Label htmlFor={`${ids}-ref`} optional>
                    {ref}
                  </Label>
                  <input id={`${ids}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" className={`${FIELD} font-mono`} />
                </div>
              )
            )}
            <div>
              <Label htmlFor={`${ids}-date`}>Paid on</Label>
              <input
                id={`${ids}-date`}
                type="date"
                value={date}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={Boolean(dateProblem)}
                className={`${FIELD} font-mono ${dateProblem ? 'border-red-400' : ''}`}
              />
              {dateProblem && <p className="mt-1.5 text-sm font-medium text-red-700">{dateProblem}</p>}
            </div>
            <div>
              <Label htmlFor={`${ids}-or`} optional>
                Receipt number
              </Label>
              <input id={`${ids}-or`} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} maxLength={200} autoComplete="off" placeholder="From a paper receipt booklet" className={`${FIELD} font-mono`} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`${ids}-notes`} optional>
                Note
              </Label>
              <input id={`${ids}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="e.g. Paid by the patient’s daughter" className={FIELD} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || (attempted && problemCount) ? 'font-medium text-red-700' : 'text-gray-600'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ?? (attempted && problemCount ? `${problemCount === 1 ? 'One thing needs' : 'Two things need'} fixing.` : 'The receipt can be printed once it is recorded.')}
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
              {busy ? 'Recording…' : `Record ${!amountProblem ? money(value) : 'payment'}`}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
