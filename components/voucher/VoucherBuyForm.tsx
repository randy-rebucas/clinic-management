'use client';

import { useState } from 'react';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const PRIMARY = `inline-flex w-full items-center justify-center rounded-md bg-brand-teal-dark px-4 py-3 text-base font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS}`;
const FIELD = 'block w-full rounded-md border border-gray-300 px-3 py-2.5 text-base text-gray-900 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

/** Email for the code, then off to PayMongo's checkout. */
export default function VoucherBuyForm({ priceLabel }: { priceLabel: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/emcr/vouchers/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      setError(json?.error || json?.message || 'The payment page couldn’t be opened. Please try again.');
    } catch {
      setError('No connection. Check your internet and try again.');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="voucher-email" className="block text-sm font-medium text-gray-900">
          Email address
        </label>
        <p id="voucher-email-hint" className="mt-0.5 text-sm text-gray-600">
          We send your activation code here, with PayMongo&rsquo;s receipt.
        </p>
        <input
          id="voucher-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby="voucher-email-hint"
          aria-invalid={error ? true : undefined}
          className={`mt-2 ${FIELD}`}
          placeholder="you@example.com"
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={PRIMARY}>
        {busy ? 'Opening payment…' : `Pay ${priceLabel}`}
      </button>
      <p className="text-center text-xs text-gray-500">GCash, Maya, card, GrabPay or QR Ph, through PayMongo&rsquo;s secure page.</p>
    </form>
  );
}
