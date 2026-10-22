'use client';

import { useState } from 'react';
import type { PayPageView } from '@/lib/payments/invoice-pay';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const PRIMARY = `inline-flex w-full items-center justify-center rounded-md bg-brand-teal-dark px-4 py-3 text-base font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS}`;
const FIELD = 'block w-full rounded-md border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

/** Pay online, or pay by QR / bank transfer and tell the clinic the reference number. */
export default function PayPageClient({ token, view }: { token: string; view: PayPageView }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimFor, setClaimFor] = useState<string | null>(null);
  const [sent, setSent] = useState(view.pendingClaim);

  async function payOnline(accountId: string) {
    setBusy(accountId);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${token}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }) });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        window.location.assign(json.data.url);
        return;
      }
      setError(json?.error || 'The payment page couldn’t be opened.');
    } catch {
      setError('No connection. Check your internet and try again.');
    }
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
        <p className="text-sm font-medium text-gray-500">{view.clinicName}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900">Invoice {view.invoiceNumber}</h1>
        {view.status === 'open' ? (
          <p className="mt-3 text-gray-700">
            Balance due <span className="block text-3xl font-bold tabular-nums text-gray-900">{peso(view.owed)}</span>
          </p>
        ) : (
          <p className="mt-3 text-gray-700">{view.status === 'paid' ? 'This bill is fully paid. Thank you!' : 'This bill was refunded; nothing is due.'}</p>
        )}
      </div>

      {view.status === 'open' && sent && (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          The clinic has your payment details and will confirm once it arrives. You don&rsquo;t need to pay again.
        </p>
      )}
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

      {view.status === 'open' && view.options.length === 0 && (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">The clinic hasn&rsquo;t set up payment here yet. Please pay at the clinic.</p>
      )}

      {view.status === 'open' &&
        view.options.map((o) =>
          o.online ? (
            <div key={o.accountId} className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="font-semibold text-gray-900">{o.label}</p>
              <p className="mt-0.5 text-sm text-gray-600">GCash, Maya, card or QR Ph. You&rsquo;re taken to a secure payment page.</p>
              <div className="mt-4">
                {o.payable ? (
                  <button type="button" disabled={busy !== null} onClick={() => payOnline(o.accountId)} className={PRIMARY}>
                    {busy === o.accountId ? 'Opening…' : `Pay ${peso(view.owed)}`}
                  </button>
                ) : (
                  <p className="text-sm text-gray-600">Online payments start at ₱20. Please pay at the clinic.</p>
                )}
              </div>
            </div>
          ) : (
            <div key={o.accountId} className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="font-semibold text-gray-900">{o.label}</p>
              {o.manual?.qrImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.manual.qrImage} alt={`QR code for ${o.label}`} className="mx-auto mt-4 h-56 w-56 rounded-md border border-gray-200 object-contain" />
              )}
              <dl className="mt-3 space-y-1 text-sm text-gray-700">
                {o.manual?.bankName && <div><dt className="inline text-gray-500">Bank: </dt><dd className="inline font-medium">{o.manual.bankName}</dd></div>}
                {o.manual?.accountName && <div><dt className="inline text-gray-500">Account name: </dt><dd className="inline font-medium">{o.manual.accountName}</dd></div>}
                {o.manual?.number && <div><dt className="inline text-gray-500">{o.provider === 'bank_transfer' ? 'Account no.: ' : 'Number: '}</dt><dd className="inline font-mono font-medium">{o.manual.number}</dd></div>}
              </dl>
              {o.manual?.instructions && <p className="mt-2 text-sm text-gray-600">{o.manual.instructions}</p>}
              {claimFor === o.accountId ? (
                <ClaimForm token={token} accountId={o.accountId} owed={view.owed} onSent={() => { setSent(true); setClaimFor(null); }} />
              ) : (
                <button type="button" onClick={() => setClaimFor(o.accountId)} className={`mt-4 text-sm font-semibold text-brand-teal-dark hover:underline ${FOCUS}`}>
                  I&rsquo;ve paid: send the reference number
                </button>
              )}
            </div>
          )
        )}
    </div>
  );
}

function ClaimForm({ token, accountId, owed, onSent }: { token: string; accountId: string; owed: number; onSent: () => void }) {
  const [amount, setAmount] = useState(String(owed));
  const [referenceNo, setReferenceNo] = useState('');
  const [payerName, setPayerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pay/${token}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, amount: Number(amount), referenceNo, payerName: payerName || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) onSent();
      else setError(json?.error || 'That didn’t go through.');
    } catch {
      setError('No connection. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
      <div>
        <label htmlFor={`amt-${accountId}`} className="mb-1 block text-sm font-medium text-gray-700">Amount you paid (₱)</label>
        <input id={`amt-${accountId}`} type="number" inputMode="decimal" min={1} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor={`ref-${accountId}`} className="mb-1 block text-sm font-medium text-gray-700">Reference number</label>
        <input id={`ref-${accountId}`} required minLength={4} maxLength={100} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} className={FIELD} />
      </div>
      <div>
        <label htmlFor={`name-${accountId}`} className="mb-1 block text-sm font-medium text-gray-700">Paid by <span className="font-normal text-gray-500">(optional)</span></label>
        <input id={`name-${accountId}`} maxLength={150} value={payerName} onChange={(e) => setPayerName(e.target.value)} className={FIELD} />
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className={PRIMARY}>{busy ? 'Sending…' : 'Send to the clinic'}</button>
    </form>
  );
}
