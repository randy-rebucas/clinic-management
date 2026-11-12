'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SponsorshipRow, SponsorshipSection } from '@/lib/subscription-page';
import { termLabel } from '@/lib/sponsorship-pricing';
import { Panel } from '@/components/dashboards/shared';
import { FIELD } from '@/components/appointments/shared';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const PRIMARY = `inline-flex items-center justify-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;
const SECONDARY = `inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors duration-150 hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const repLabel = (s: SponsorshipRow) => (s.rep.company ? `${s.rep.name} (${s.rep.company})` : s.rep.name);

/**
 * "Sponsored by a medical rep" on /admin/subscription: ask a linked rep to pay for the plan,
 * answer a rep's offer, see who is paying and until when, or end it.
 */
export default function SponsorshipPanel({ section }: { section: SponsorshipSection | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repId, setRepId] = useState('');
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [linked, setLinked] = useState<string | null>(null);

  if (!section) return null;
  const { current, reps, prices } = section;
  const monthly = prices.quotes.find((q) => q.months === 1);

  async function call(url: string, method: 'POST' | 'PATCH', body: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'That didn’t go through. Try again.');
      setRepId('');
      setMessage('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function addByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setLinked(null);
    try {
      const res = await fetch('/api/tenants/referral-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'That didn’t go through. Try again.');
      setCode('');
      setLinked(json.message ?? 'Rep added.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const act = (action: 'accept' | 'decline' | 'cancel', confirmText?: string) =>
    current && call(`/api/subscription/sponsorship/${current.id}`, 'PATCH', { action }, confirmText);

  return (
    <div id="sponsorship" className="scroll-mt-24">
      <Panel
        title="Sponsored by a medical rep"
        subtitle={`A rep you work with can pay for your plan: Professional at ${monthly ? peso(monthly.amount) : '—'} a month, or less when they prepay.`}
      >
        <div className="flex flex-col gap-4 px-5 pb-5">
          <ul className="flex flex-wrap gap-2 text-xs text-gray-600" aria-label="Sponsorship prices">
            {prices.quotes.map((q) => (
              <li key={q.months} className="rounded-full border border-gray-200 px-2.5 py-1">
                <span className="font-semibold text-gray-900">{termLabel(q.months)}</span> {peso(q.amount)}
                {q.percentOff > 0 && <span className="text-brand-teal-deep"> · {q.percentOff}% off</span>}
              </li>
            ))}
          </ul>

          {!current && (
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (repId) void call('/api/subscription/sponsorship', 'POST', { repId, message: message || undefined });
              }}
            >
              <div>
                <label htmlFor="sp-rep" className="mb-1.5 block text-sm font-medium text-gray-700">Representative</label>
                <select id="sp-rep" value={repId} onChange={(e) => setRepId(e.target.value)} className={FIELD} disabled={reps.length === 0}>
                  <option value="">{reps.length ? 'Choose a rep' : 'No linked reps yet'}</option>
                  {reps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.company ? `${r.name} (${r.company})` : r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sp-msg" className="mb-1.5 block text-sm font-medium text-gray-700">Message (optional)</label>
                <input id="sp-msg" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} className={FIELD} placeholder="A note for the rep" />
              </div>
              <button type="submit" disabled={busy || !repId} className={PRIMARY}>
                {busy ? 'Sending…' : 'Ask to sponsor'}
              </button>
              {reps.length === 0 && (
                <p className="text-xs text-gray-500 sm:col-span-3">
                  Reps appear here once they are linked to the clinic: enter a rep’s referral code below, add them under Medical reps → Representatives, or approve one of their visits.
                </p>
              )}
            </form>
          )}

          {!current && (
            <form onSubmit={addByCode} className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-end">
              <div className="sm:w-72">
                <label htmlFor="sp-code" className="mb-1.5 block text-sm font-medium text-gray-700">Have a rep’s referral code?</label>
                <input
                  id="sp-code"
                  value={code}
                  maxLength={24}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className={`${FIELD} font-mono uppercase tracking-wide`}
                  placeholder="REP-7K2PQX"
                />
              </div>
              <button type="submit" disabled={busy || !code.trim()} className={SECONDARY}>
                {busy ? 'Adding…' : 'Add rep'}
              </button>
              {linked && <p role="status" className="text-sm text-brand-teal-deep sm:self-center">{linked}</p>}
            </form>
          )}

          {current && <Current s={current} busy={busy} act={act} />}

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {section.history.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-gray-700">Earlier sponsorships</summary>
              <ul className="mt-2 divide-y divide-gray-100">
                {section.history.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2 text-gray-600">
                    <span>{repLabel(s)}</span>
                    <span>
                      {STATUS_WORD[s.status]} · {s.createdOn}
                      {s.paidThroughOn ? ` · paid through ${s.paidThroughOn}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Panel>
    </div>
  );
}

const STATUS_WORD: Record<SponsorshipRow['status'], string> = {
  pending: 'Waiting for an answer',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Withdrawn',
  ended: 'Ended',
};

function Current({ s, busy, act }: { s: SponsorshipRow; busy: boolean; act: (a: 'accept' | 'decline' | 'cancel', confirm?: string) => void }) {
  const who = repLabel(s);
  let title: string;
  let detail: string;
  if (s.status === 'pending' && s.awaitingYou) {
    title = `${who} offers to sponsor your plan`;
    detail = 'If you accept, they pay for Professional for the clinic. Nothing is charged to the clinic.';
  } else if (s.status === 'pending') {
    title = `Waiting for ${who} to answer`;
    detail = `You asked on ${s.createdOn}. They’ll see it in the MyClinicSoft Rep app.`;
  } else if (s.active) {
    title = `Sponsored by ${who}`;
    detail = `Professional is paid through ${s.paidThroughOn}. ${who.split(' (')[0]} can renew before then.`;
  } else if (s.payments.length) {
    title = `${who}’s sponsorship has run out`;
    detail = `It was paid through ${s.paidThroughOn}. They can renew it from the Rep app, or you can pay for a plan below.`;
  } else {
    title = `${who} agreed to sponsor your plan`;
    detail = 'Waiting for their payment. Your plan changes as soon as it is confirmed.';
  }

  return (
    <div className="rounded-lg border border-brand-teal/30 bg-brand-teal-light/40 px-4 py-3.5">
      <p className="text-sm font-semibold text-brand-teal-deep">{title}</p>
      <p className="mt-0.5 text-sm text-gray-700">{detail}</p>
      {s.message && <p className="mt-1 text-sm italic text-gray-600">“{s.message}”</p>}
      {s.payments.length > 0 && (
        <p className="mt-1 text-xs text-gray-600">
          {s.payments.length} payment{s.payments.length === 1 ? '' : 's'}: {s.payments.map((p) => `${termLabel(p.months)}${p.refunded ? ' (refunded)' : ''}`).join(', ')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {s.status === 'pending' && s.awaitingYou && (
          <>
            <button type="button" disabled={busy} onClick={() => act('accept')} className={PRIMARY}>Accept</button>
            <button type="button" disabled={busy} onClick={() => act('decline')} className={SECONDARY}>Decline</button>
          </>
        )}
        {s.status === 'pending' && !s.awaitingYou && (
          <button type="button" disabled={busy} onClick={() => act('cancel', 'Withdraw this request?')} className={SECONDARY}>Withdraw request</button>
        )}
        {s.status === 'accepted' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('cancel', 'End this sponsorship? Time already paid for stays on your plan; the rep can’t renew it afterwards.')}
            className={SECONDARY}
          >
            End sponsorship
          </button>
        )}
      </div>
    </div>
  );
}
