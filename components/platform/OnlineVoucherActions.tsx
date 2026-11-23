'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD } from '../appointments/shared';
import { OUTLINE, callPlatform } from './platform-api';

const CHECKOUT_STATUS: Record<string, string> = {
  active: 'Checkout still open, no payment yet.',
  expired: 'Checkout expired without a payment.',
};

/** One online purchase: show its code, email it again, or ask PayMongo about a pending one. */
export default function OnlineVoucherActions({ id, status, email }: { id: string; status: 'pending' | 'unused' | 'redeemed'; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [resendOpen, setResendOpen] = useState(false);
  const [to, setTo] = useState(email);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function run<T>(key: string, url: string, method: string, body: unknown, done: (data: T) => void) {
    setBusy(key);
    setNotice(null);
    const r = await callPlatform<T>(url, method, body);
    setBusy(null);
    if (!r.ok) return setNotice({ tone: 'error', text: r.error });
    done(r.data);
  }

  const url = `/api/platform/vouchers/online/${id}`;
  const SMALL = `${OUTLINE} px-2 py-1 text-xs`;

  if (status === 'pending') {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={!!busy}
          className={SMALL}
          onClick={() =>
            run<{ status: string; checkoutStatus?: string }>('check', url, 'POST', { action: 'check' }, (d) => {
              if (d.status === 'paid') {
                setNotice({ tone: 'ok', text: 'Paid. The code is live and was emailed.' });
                router.refresh();
              } else {
                setNotice({ tone: 'ok', text: CHECKOUT_STATUS[d.checkoutStatus ?? ''] ?? 'No payment on this checkout.' });
              }
            })
          }
        >
          {busy === 'check' ? 'Checking…' : 'Check payment'}
        </button>
        <RowNotice notice={notice} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {code ? (
          <span className="select-all rounded bg-gray-100 px-2 py-1 font-mono text-xs font-semibold text-gray-900">{code}</span>
        ) : (
          <button type="button" disabled={!!busy} className={SMALL} onClick={() => run<{ code: string }>('show', url, 'GET', undefined, (d) => setCode(d.code))}>
            {busy === 'show' ? 'Loading…' : 'Show code'}
          </button>
        )}
        {status === 'unused' && !resendOpen && (
          <button type="button" disabled={!!busy} className={SMALL} onClick={() => setResendOpen(true)}>
            Resend email
          </button>
        )}
      </div>
      {resendOpen && (
        <form
          className="flex flex-wrap items-center justify-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run<{ sentTo: string }>('resend', url, 'POST', { action: 'resend', email: to.trim() || undefined }, (d) => {
              setNotice({ tone: 'ok', text: `Sent to ${d.sentTo}.` });
              setResendOpen(false);
              router.refresh();
            });
          }}
        >
          <label htmlFor={`resend-${id}`} className="sr-only">Send the code to</label>
          <input id={`resend-${id}`} type="email" required maxLength={254} value={to} onChange={(e) => setTo(e.target.value)} className={`${FIELD} w-56 py-1 text-xs`} />
          <button type="submit" disabled={!!busy} className={SMALL}>{busy === 'resend' ? 'Sending…' : 'Send'}</button>
          <button type="button" className={`${SMALL} border-transparent`} onClick={() => setResendOpen(false)}>Cancel</button>
        </form>
      )}
      <RowNotice notice={notice} />
    </div>
  );
}

function RowNotice({ notice }: { notice: { tone: 'ok' | 'error'; text: string } | null }) {
  if (!notice) return null;
  return (
    <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`max-w-[260px] whitespace-normal text-right text-xs ${notice.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
      {notice.text}
    </p>
  );
}
