'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { useMoney, shortDate } from '../invoices/shared';
import { useSend } from '../admin/users-shared';
import { AlertDialog } from '../ui/Modal';
import { BATCH_STATUS, CLAIM_LINE_STATUS, type BatchStatus, type ClaimLineStatus } from '@/lib/hmo';
import { roundMoney } from '@/lib/invoice-totals';

interface Claim {
  invoice: string;
  invoiceNumber: string;
  patientName: string;
  memberId?: string;
  loaNumber?: string;
  amount: number;
  paid: number;
  withheld: number;
  suggestedWithheld: number;
  status: ClaimLineStatus;
  denialReason?: string;
}
interface Batch {
  _id: string;
  batchNumber: string;
  hmoName: string;
  status: BatchStatus;
  claims: Claim[];
  totalClaimed: number;
  submittedAt?: string;
  dueAt?: string;
  createdAt: string;
  createdBy?: { name: string } | null;
  remittances: { _id: string; date: string; reference?: string; net: number; withheld: number; form2307Received: boolean; recordedBy?: { name: string } | null; notes?: string }[];
  hmo: { name: string; email?: string; phone?: string; contactName?: string; paymentTermsDays: number } | null;
}
interface Row {
  paid: string;
  withheld: string;
  denied: boolean;
  reason: string;
}

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:opacity-50 ${FOCUS_RING}`;
const PRINT = 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z';
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const num = (s: string) => (s.trim() === '' ? 0 : Number(s));

/** One transmittal: send it, print the letter, and match the HMO's payment to its claims. */
export default function HmoBatchClient({ id }: { id: string }) {
  const router = useRouter();
  const { money } = useMoney();
  const send = useSend('The transmittal couldn’t be updated');
  const data = useKeyedFetch<Batch>(`/api/hmo-claims/${id}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remitting, setRemitting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [date, setDate] = useState(todayKey);
  const [reference, setReference] = useState('');
  const [got2307, setGot2307] = useState(false);

  const b = data.value;
  if (data.error) {
    return (
      <div className="max-w-6xl mx-auto">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          This transmittal didn’t load ({data.error}).
        </p>
      </div>
    );
  }
  if (!b) return <div className="max-w-6xl mx-auto h-96 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />;

  const st = BATCH_STATUS[b.status];
  const open = b.claims.filter((c) => c.status === 'pending');
  const received = b.claims.reduce((s, c) => s + c.paid + c.withheld, 0);
  const owed = open.reduce((s, c) => s + c.amount - c.paid - c.withheld, 0);
  const canRemit = b.status === 'submitted' || b.status === 'partial';

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    const r = await send(`/api/hmo-claims/${id}`, 'PUT', body);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setNotice(done);
    data.reload();
    return r.data as Record<string, unknown>;
  };

  const startRemit = () => {
    // Prefill: the rest of each claim, less what the HMO is likely to withhold.
    setRows(
      Object.fromEntries(
        open.map((c) => {
          const left = roundMoney(c.amount - c.paid - c.withheld);
          const wht = c.paid + c.withheld > 0 ? 0 : Math.min(c.suggestedWithheld, left);
          return [c.invoice, { paid: String(roundMoney(left - wht)), withheld: String(wht), denied: false, reason: '' }];
        })
      )
    );
    setRemitting(true);
    setNotice(null);
  };
  const lineTotal = Object.entries(rows).reduce((s, [, r]) => s + (r.denied && num(r.paid) + num(r.withheld) === 0 ? 0 : num(r.paid)), 0);
  const whtTotal = Object.values(rows).reduce((s, r) => s + num(r.withheld), 0);
  const bad = Object.entries(rows).find(([inv, r]) => {
    const c = b.claims.find((x) => x.invoice === inv);
    const v = num(r.paid) + num(r.withheld);
    return !Number.isFinite(v) || num(r.paid) < 0 || num(r.withheld) < 0 || (c && v > c.amount - c.paid - c.withheld + 0.005);
  });

  const submitRemit = async () => {
    if (bad) {
      setError('A claim has an amount below 0 or more than is left on it.');
      return;
    }
    const lines = Object.entries(rows)
      .map(([invoice, r]) => ({ invoice, paid: roundMoney(num(r.paid)), withheld: roundMoney(num(r.withheld)), denied: r.denied || undefined, denialReason: r.reason.trim() || undefined }))
      .filter((l) => l.paid + l.withheld > 0 || l.denied);
    if (!lines.length) {
      setError('Enter what was paid on at least one claim, or mark it denied.');
      return;
    }
    const r = await act({ action: 'remit', date, reference: reference.trim() || undefined, form2307Received: got2307, lines }, 'Payment recorded on the invoices.');
    if (r) {
      const failed = (r.failed as { invoiceNumber: string; error: string }[]) ?? [];
      if (failed.length) setError(`Not posted: ${failed.map((f) => `${f.invoiceNumber} (${f.error})`).join('; ')}`);
      setRemitting(false);
      setReference('');
    }
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <Link href="/hmo-claims?tab=batches" className={`inline-flex w-fit items-center gap-1 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
        ← HMO claims
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{b.hmoName}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
            <span className="font-mono text-sm text-gray-500">{b.batchNumber}</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {b.submittedAt ? `Sent ${shortDate(b.submittedAt)}` : `Made ${shortDate(b.createdAt)}${b.createdBy ? ` by ${b.createdBy.name}` : ''}; not sent yet`}
            {b.dueAt && canRemit && <> · payment due {shortDate(b.dueAt)}</>}
            {b.hmo?.email && <> · {b.hmo.email}</>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/hmo-claims/${id}/transmittal`} target="_blank" rel="noopener noreferrer" className={OUTLINE}>
            <Svg d={PRINT} />
            Print transmittal
          </a>
          {b.status === 'draft' && (
            <button type="button" disabled={busy} onClick={() => act({ action: 'submit' }, 'Marked as sent. Payment is due by the HMO’s terms.')} className={PRIMARY}>
              <Svg d={ICON.check} />
              Mark as sent
            </button>
          )}
          {canRemit && !remitting && (
            <button type="button" disabled={busy} onClick={startRemit} className={PRIMARY}>
              Record HMO payment
            </button>
          )}
          {canRemit && !remitting && (
            <button type="button" disabled={busy} onClick={() => setConfirmClose(true)} className={OUTLINE}>
              Close
            </button>
          )}
        </div>
      </header>

      {notice && !error && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          {error}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4">
        {[
          ['Claimed', money(b.totalClaimed), `${b.claims.length} claims`],
          ['Received', money(received), `${money(b.claims.reduce((s, c) => s + c.withheld, 0))} of it withheld tax`],
          ['Still owed', money(owed), `${open.length} claims open`],
          ['Denied', String(b.claims.filter((c) => c.status === 'denied').length), 'the patient owes these'],
        ].map(([l, v, s]) => (
          <div key={l} className="bg-white px-5 py-4">
            <dt className="text-sm text-gray-600">{l}</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-gray-900">{v}</dd>
            <dd className="mt-0.5 text-xs text-gray-500">{s}</dd>
          </div>
        ))}
      </dl>

      {remitting && (
        <section className="motion-panel-in rounded-lg border border-brand-teal/40 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-bold tracking-tight text-gray-900">Record the HMO’s payment</h2>
            <p className="mt-0.5 text-sm text-gray-600">From the remittance advice: what was paid on each claim, and the tax withheld. Each is posted to its invoice.</p>
          </div>
          <div className="grid gap-4 border-b border-gray-100 px-5 py-4 sm:grid-cols-3">
            <div>
              <label htmlFor="rm-date" className="mb-1.5 block text-sm font-medium text-gray-700">
                Received on
              </label>
              <input id="rm-date" type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={`${FIELD} font-mono`} />
            </div>
            <div>
              <label htmlFor="rm-ref" className="mb-1.5 block text-sm font-medium text-gray-700">
                Cheque or transfer reference <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input id="rm-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} className={`${FIELD} font-mono`} />
            </div>
            <label className="flex items-start gap-3 self-end pb-2 text-sm">
              <input type="checkbox" checked={got2307} onChange={(e) => setGot2307(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
              <span className="font-medium text-gray-900">Form 2307 received</span>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                  <th scope="col" className="px-5 py-2.5 font-medium">Claim</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Left</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Paid</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Withheld</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Denied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {open.map((c) => {
                  const r = rows[c.invoice];
                  if (!r) return null;
                  const upd = (p: Partial<Row>) => setRows((x) => ({ ...x, [c.invoice]: { ...r, ...p } }));
                  const left = roundMoney(c.amount - c.paid - c.withheld);
                  return (
                    <tr key={c.invoice} className="align-top">
                      <th scope="row" className="px-5 py-2.5 text-left font-semibold text-gray-900">
                        {c.patientName}
                        <span className="block font-mono text-xs font-normal text-gray-500">
                          {c.invoiceNumber}
                          {c.loaNumber && ` · LOA ${c.loaNumber}`}
                        </span>
                      </th>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(left)}</td>
                      <td className="px-3 py-2">
                        <input aria-label={`Paid on ${c.invoiceNumber}`} inputMode="decimal" value={r.paid} onChange={(e) => upd({ paid: e.target.value })} className={`${FIELD} w-28 text-right font-mono tabular-nums`} />
                      </td>
                      <td className="px-3 py-2">
                        <input aria-label={`Withheld on ${c.invoiceNumber}`} inputMode="decimal" value={r.withheld} onChange={(e) => upd({ withheld: e.target.value })} className={`${FIELD} w-28 text-right font-mono tabular-nums`} />
                      </td>
                      <td className="px-5 py-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={r.denied}
                            onChange={(e) => upd(e.target.checked && num(r.paid) + num(r.withheld) >= left - 0.005 ? { denied: true, paid: '0', withheld: '0' } : { denied: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
                          />
                          <span className="text-gray-700">{num(r.paid) + num(r.withheld) > 0 ? 'Rest refused' : 'Refused'}</span>
                        </label>
                        {r.denied && <input aria-label={`Reason ${c.invoiceNumber} was refused`} value={r.reason} onChange={(e) => upd({ reason: e.target.value })} maxLength={500} placeholder="Reason" className={`${FIELD} mt-1.5 w-48`} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Posts <span className="font-mono font-semibold text-gray-900">{money(lineTotal)}</span> paid and{' '}
              <span className="font-mono font-semibold text-gray-900">{money(whtTotal)}</span> withheld. Refused amounts stay on the invoice for the patient to pay.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRemitting(false)} disabled={busy} className={OUTLINE}>
                Cancel
              </button>
              <button type="button" onClick={submitRemit} disabled={busy} aria-busy={busy} className={PRIMARY}>
                <Svg d={ICON.check} />
                {busy ? 'Posting…' : 'Post to invoices'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3.5">
          <h2 className="text-base font-bold tracking-tight text-gray-900">Claims</h2>
          <p className="text-sm text-gray-500">{st.hint}</p>
        </div>
        <ul className="divide-y divide-gray-100">
          {b.claims.map((c) => (
            <li key={c.invoice} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/invoices/${c.invoice}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                  {c.patientName || c.invoiceNumber}
                </Link>
                <p className="mt-0.5 truncate text-gray-500">
                  <span className="font-mono text-xs">{c.invoiceNumber}</span>
                  {c.memberId && <span className="font-mono text-xs"> · member {c.memberId}</span>}
                  {c.loaNumber && <span className="font-mono text-xs"> · LOA {c.loaNumber}</span>}
                  {' · '}
                  <span className={c.status === 'denied' ? 'font-semibold text-red-700' : c.status === 'short_paid' ? 'font-semibold text-amber-800' : ''}>{CLAIM_LINE_STATUS[c.status]}</span>
                  {c.denialReason && <span> · {c.denialReason}</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono font-semibold tabular-nums text-gray-900">{money(c.amount)}</p>
                {c.paid + c.withheld > 0 && (
                  <p className="font-mono text-xs tabular-nums text-gray-500">
                    {money(c.paid)} paid{c.withheld > 0 ? ` + ${money(c.withheld)} withheld` : ''}
                  </p>
                )}
                {b.status === 'draft' && (
                  <button type="button" disabled={busy} onClick={() => act({ action: 'remove', invoice: c.invoice }, 'Claim taken out; it’s back under claims to send.').then((r) => r?.deleted && router.push('/hmo-claims'))} className={`mt-1 rounded text-xs font-semibold text-gray-600 hover:text-red-700 ${FOCUS_RING}`}>
                    Take out
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {b.remittances.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-3.5">
            <h2 className="text-base font-bold tracking-tight text-gray-900">Payments received</h2>
          </div>
          <ul className="divide-y divide-gray-100 text-sm">
            {b.remittances.map((r) => (
              <li key={r._id} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3">
                <span>
                  {shortDate(r.date)}
                  {r.reference && <span className="font-mono text-xs text-gray-500"> · {r.reference}</span>}
                  {r.recordedBy && <span className="text-gray-500"> · {r.recordedBy.name}</span>}
                  <span className={`ml-2 text-xs ${r.form2307Received ? 'text-emerald-800' : 'font-semibold text-amber-800'}`}>{r.form2307Received ? '2307 received' : '2307 to follow'}</span>
                </span>
                <span className="font-mono tabular-nums text-gray-900">
                  {money(r.net)}
                  {r.withheld > 0 && <span className="text-gray-500"> + {money(r.withheld)} withheld</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`Close ${b.batchNumber}?`}
        description={`Do this when ${b.hmoName} won’t pay any more on it. The ${open.length} open ${open.length === 1 ? 'claim is' : 'claims are'} marked refused and the amounts stay on the invoices for the patients to pay. This can’t be undone.`}
      >
        <button type="button" onClick={() => setConfirmClose(false)} className={OUTLINE}>
          Keep it open
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmClose(false);
            act({ action: 'close' }, 'Transmittal closed.');
          }}
          className={`inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 ${FOCUS_RING}`}
        >
          Close transmittal
        </button>
      </AlertDialog>
    </div>
  );
}
