'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, Svg } from '../appointments/shared';
import { useMoney, shortDate } from '../invoices/shared';
import { useSend } from '../admin/users-shared';
import { AlertDialog } from '../ui/Modal';
import { BatchBadge, CHECKBOX, ICONS, LINK, PRIMARY, SECONDARY, dueWords, plural } from './shared';
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
  hmo: {
    name: string;
    email?: string;
    phone?: string;
    contactName?: string;
    paymentTermsDays: number;
    withholdingServicesRate: number;
    withholdingProfessionalRate: number;
  } | null;
  /** Each claim's bill now, and the tax to expect on what is left at the HMO's rates today. */
  invoices: Record<string, { balance: number; status: string; problem: string | null; suggestedWithheld: number | null }>;
}
interface Row {
  paid: string;
  withheld: string;
  denied: boolean;
  reason: string;
}
type Status = { tone: 'ok' | 'error'; text: ReactNode } | null;

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
const leftOn = (c: Claim) => roundMoney(c.amount - c.paid - c.withheld);

const LINE_TONE: Record<ClaimLineStatus, string> = {
  pending: 'text-gray-600',
  paid: 'text-emerald-800',
  short_paid: 'font-semibold text-amber-800',
  denied: 'font-semibold text-red-700',
};

/** One transmittal: send it, print the letter, and match the HMO's payment to its claims. */
export default function HmoBatchClient({ id }: { id: string }) {
  const router = useRouter();
  const { money } = useMoney();
  const send = useSend('The transmittal couldn’t be updated');
  const data = useKeyedFetch<Batch>(`/api/hmo-claims/${id}`);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [remitting, setRemitting] = useState(false);
  const [remitError, setRemitError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'close' | 'discard' | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [date, setDate] = useState(todayKey);
  const [reference, setReference] = useState('');
  const [got2307, setGot2307] = useState(false);

  const b = data.value;
  if (!b) {
    return (
      <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <BackLink />
          {data.error ? (
            <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">This transmittal didn’t load ({data.error}).</p>
              <button type="button" onClick={data.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
                <Svg d={ICONS.refresh} />
                Try again
              </button>
            </div>
          ) : (
            <div className="h-96 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
          )}
        </div>
      </section>
    );
  }

  const open = b.claims.filter((c) => c.status === 'pending');
  const received = roundMoney(b.claims.reduce((s, c) => s + c.paid + c.withheld, 0));
  const withheld = roundMoney(b.claims.reduce((s, c) => s + c.withheld, 0));
  const owed = roundMoney(open.reduce((s, c) => s + leftOn(c), 0));
  const refusedClaims = b.claims.filter((c) => c.status === 'denied' || c.status === 'short_paid');
  const refused = roundMoney(refusedClaims.reduce((s, c) => s + leftOn(c), 0));
  const canRemit = b.status === 'submitted' || b.status === 'partial';
  const due = canRemit && b.dueAt ? dueWords(b.dueAt) : null;
  const stale = b.claims.filter((c) => b.invoices?.[c.invoice]?.problem);

  const act = async (body: Record<string, unknown>, done: ReactNode) => {
    setBusy(true);
    setStatus(null);
    const r = await send(`/api/hmo-claims/${id}`, 'PUT', body);
    if (!r.ok) {
      setBusy(false);
      setStatus({ tone: 'error', text: r.error });
      return;
    }
    // The draft is gone (thrown away, or its last claim taken out): leave rather than reload a 404.
    if ((r.data as { deleted?: boolean } | undefined)?.deleted) {
      router.push('/hmo-claims');
      return;
    }
    setBusy(false);
    setStatus({ tone: 'ok', text: done });
    data.reload();
  };

  /** What can be posted on a claim: the rest of it, but never more than its bill still owes. */
  const postable = (c: Claim) => {
    const balance = b.invoices?.[c.invoice]?.balance;
    return roundMoney(Math.max(0, Math.min(leftOn(c), balance ?? Infinity)));
  };

  const startRemit = () => {
    // Prefill: the rest of each claim, less what the HMO is likely to withhold at its rates today.
    setRows(
      Object.fromEntries(
        open.map((c) => {
          const cap = postable(c);
          const expected = b.invoices?.[c.invoice]?.suggestedWithheld ?? c.suggestedWithheld;
          const wht = c.paid + c.withheld > 0 ? 0 : Math.min(expected, cap);
          return [c.invoice, { paid: String(roundMoney(cap - wht)), withheld: String(wht), denied: false, reason: '' }];
        })
      )
    );
    setRemitting(true);
    setRemitError(null);
    setStatus(null);
  };
  const paidTotal = Object.values(rows).reduce((s, r) => s + (Number.isFinite(num(r.paid)) ? num(r.paid) : 0), 0);
  const whtTotal = Object.values(rows).reduce((s, r) => s + (Number.isFinite(num(r.withheld)) ? num(r.withheld) : 0), 0);
  const deniedCount = Object.values(rows).filter((r) => r.denied).length;
  const badRow = (inv: string, r: Row) => {
    const c = b.claims.find((x) => x.invoice === inv);
    const p = num(r.paid);
    const w = num(r.withheld);
    if (!Number.isFinite(p) || !Number.isFinite(w) || p < 0 || w < 0) return 'Enter amounts of 0 or more.';
    if (!c) return null;
    if (p + w > leftOn(c) + 0.005) return `More than the ${money(leftOn(c))} left on this claim.`;
    if (p + w > postable(c) + 0.005) return `The bill owes only ${money(postable(c))} now.`;
    return null;
  };

  const submitRemit = async () => {
    const bad = Object.entries(rows).find(([inv, r]) => badRow(inv, r));
    if (bad) {
      setRemitError(`${b.claims.find((c) => c.invoice === bad[0])?.invoiceNumber}: ${badRow(bad[0], bad[1])}`);
      return;
    }
    const lines = Object.entries(rows)
      .map(([invoice, r]) => ({ invoice, paid: roundMoney(num(r.paid)), withheld: roundMoney(num(r.withheld)), denied: r.denied || undefined, denialReason: r.reason.trim() || undefined }))
      .filter((l) => l.paid + l.withheld > 0 || l.denied);
    if (!lines.length) {
      setRemitError('Enter what was paid on at least one claim, or mark one refused.');
      return;
    }
    setBusy(true);
    setRemitError(null);
    const r = await send(`/api/hmo-claims/${id}`, 'PUT', { action: 'remit', date, reference: reference.trim() || undefined, form2307Received: got2307, lines });
    setBusy(false);
    if (!r.ok) {
      setRemitError(r.error);
      return;
    }
    const result = r.data as { posted: number; failed: { invoiceNumber: string; error: string }[] };
    setRemitting(false);
    setReference('');
    setGot2307(false);
    setStatus(
      result.failed.length
        ? { tone: 'error', text: `Posted ${plural(result.posted, 'claim')}. Not posted: ${result.failed.map((f) => `${f.invoiceNumber} (${f.error})`).join('; ')}` }
        : { tone: 'ok', text: `Posted to ${plural(result.posted, 'bill')}.` }
    );
    data.reload();
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <BackLink />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{b.hmoName}</h1>
              <BatchBadge status={b.status} />
              <span className="font-mono text-sm text-gray-500">{b.batchNumber}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {b.submittedAt ? <>Sent {shortDate(b.submittedAt)}</> : <>Made {shortDate(b.createdAt)}{b.createdBy ? ` by ${b.createdBy.name}` : ''}; not marked sent yet</>}
              {due && (
                <>
                  {' · '}
                  <span className={due.late ? 'font-medium text-red-700' : undefined}>
                    {due.late ? `payment ${due.text} (due ${shortDate(b.dueAt!)})` : `payment due ${shortDate(b.dueAt!)}`}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/hmo-claims/${id}/transmittal`} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
              <Svg d={ICONS.print} />
              Print transmittal
            </a>
            {b.status === 'draft' && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirm('discard')}
                  disabled={busy}
                  aria-label={`Throw away ${b.batchNumber}`}
                  title="Throw away this draft"
                  className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`}
                >
                  <Svg d={ICONS.trash} />
                </button>
                <button
                  type="button"
                  disabled={busy || stale.length > 0}
                  onClick={() => act({ action: 'submit' }, `Marked as sent. ${b.hmoName} should pay by its terms, and the due date is now set.`)}
                  className={PRIMARY}
                >
                  <Svg d={ICONS.check} />
                  Mark as sent
                </button>
              </>
            )}
            {canRemit && !remitting && (
              <>
                <button type="button" disabled={busy} onClick={() => setConfirm('close')} className={SECONDARY}>
                  Close
                </button>
                <button type="button" disabled={busy} onClick={startRemit} className={PRIMARY}>
                  Record HMO payment
                </button>
              </>
            )}
          </div>
        </header>

        {status && (
          <div
            role={status.tone === 'error' ? 'alert' : 'status'}
            className={`motion-panel-in flex items-start justify-between gap-3 rounded-lg border p-4 text-sm font-medium ${status.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          >
            <p>{status.text}</p>
            <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss" className={`shrink-0 rounded ${FOCUS_RING}`}>
              <Svg d={ICONS.x} />
            </button>
          </div>
        )}

        {stale.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">
                {plural(stale.length, 'claim')} no longer {stale.length === 1 ? 'matches its bill' : 'match their bills'}.
              </span>{' '}
              {b.status === 'draft'
                ? 'Take them out before marking this sent; the HMO would be asked for money the bill no longer owes.'
                : 'The HMO’s payment can only be posted up to what each bill still owes.'}
            </p>
          </div>
        )}

        {/* Summary strip */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <dl className="grid -mr-px -mb-px grid-cols-2 lg:grid-cols-4">
            <Figure label="Claimed" value={money(b.totalClaimed)} note={plural(b.claims.length, 'claim')} />
            <Figure label="Received" value={money(received)} note={withheld > 0 ? `${money(withheld)} of it withheld tax` : received > 0 ? 'No tax withheld' : 'Nothing yet'} />
            <Figure
              label="Still owed"
              value={money(b.status === 'draft' ? b.totalClaimed : owed)}
              note={b.status === 'draft' ? 'once it’s sent' : due?.late ? due.text : `${plural(open.length, 'claim')} open`}
              attention={Boolean(due?.late && owed > 0)}
            />
            <Figure label="Refused" value={money(refused)} note={refusedClaims.length ? `${plural(refusedClaims.length, 'claim')}; the patients owe it` : 'None'} />
          </dl>
        </div>

        {remitting && (
          <section className="motion-panel-in rounded-lg border border-brand-teal/40 bg-white" aria-labelledby="remit-h">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 id="remit-h" className="text-base font-bold tracking-tight text-gray-900">
                Record {b.hmoName}’s payment
              </h2>
              <p className="mt-0.5 text-sm text-gray-600">
                From the remittance advice: what was paid on each claim, and the tax withheld. Each line is posted to its bill. The amounts start at the rest of each claim, less the tax
                {b.hmo ? ` this HMO usually withholds (${b.hmo.withholdingServicesRate}% on services, ${b.hmo.withholdingProfessionalRate}% on doctors’ fees)` : ' it usually withholds'}.
              </p>
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
                <input id="rm-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" className={`${FIELD} font-mono`} />
              </div>
              <label className="flex items-start gap-3 self-end pb-2 text-sm">
                <input type="checkbox" checked={got2307} onChange={(e) => setGot2307(e.target.checked)} className={`mt-0.5 ${CHECKBOX}`} />
                <span>
                  <span className="font-medium text-gray-900">Form 2307 received</span>
                  <span className="block text-gray-500">The BIR certificate for the tax withheld.</span>
                </span>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Claim
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Left
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Paid
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Tax withheld
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-medium">
                      Refused
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {open.map((c) => {
                    const r = rows[c.invoice];
                    if (!r) return null;
                    const upd = (p: Partial<Row>) => setRows((x) => ({ ...x, [c.invoice]: { ...r, ...p } }));
                    const left = leftOn(c);
                    const err = badRow(c.invoice, r);
                    const errId = `rm-err-${c.invoice}`;
                    const inv = b.invoices?.[c.invoice];
                    return (
                      <tr key={c.invoice} className="align-top">
                        <th scope="row" className="px-5 py-2.5 text-left font-semibold text-gray-900">
                          {c.patientName || c.invoiceNumber}
                          <span className="block font-mono text-xs font-normal text-gray-500">
                            {c.invoiceNumber}
                            {c.loaNumber && ` · LOA ${c.loaNumber}`}
                          </span>
                          {inv?.problem && <span className="mt-1 block text-xs font-medium text-amber-800">{inv.problem}</span>}
                        </th>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(left)}</td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Paid on ${c.invoiceNumber}`}
                            aria-invalid={Boolean(err)}
                            aria-describedby={err ? errId : undefined}
                            inputMode="decimal"
                            value={r.paid}
                            onChange={(e) => upd({ paid: e.target.value })}
                            className={`${FIELD} w-28 text-right font-mono tabular-nums ${err ? 'border-red-400' : ''}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Tax withheld on ${c.invoiceNumber}`}
                            aria-invalid={Boolean(err)}
                            aria-describedby={err ? errId : undefined}
                            inputMode="decimal"
                            value={r.withheld}
                            onChange={(e) => upd({ withheld: e.target.value })}
                            className={`${FIELD} w-28 text-right font-mono tabular-nums ${err ? 'border-red-400' : ''}`}
                          />
                          {err && (
                            <span id={errId} className="mt-1 block w-28 text-right text-xs font-medium text-red-700">
                              {err}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={r.denied}
                              onChange={(e) => upd(e.target.checked && num(r.paid) + num(r.withheld) >= left - 0.005 ? { denied: true, paid: '0', withheld: '0' } : { denied: e.target.checked })}
                              className={CHECKBOX}
                            />
                            <span className="text-gray-700">
                              {num(r.paid) + num(r.withheld) > 0 ? 'The rest refused' : 'Refused'}
                              <span className="sr-only"> ({c.invoiceNumber})</span>
                            </span>
                          </label>
                          {r.denied && (
                            <input
                              aria-label={`Why ${c.invoiceNumber} was refused`}
                              value={r.reason}
                              onChange={(e) => upd({ reason: e.target.value })}
                              maxLength={500}
                              placeholder="Reason given"
                              className={`${FIELD} mt-1.5 w-48`}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className={`text-sm ${remitError ? 'font-medium text-red-700' : 'text-gray-600'}`} role={remitError ? 'alert' : undefined} aria-live="polite">
                {remitError ?? (
                  <>
                    Posts <span className="font-mono font-semibold text-gray-900">{money(paidTotal)}</span> paid and{' '}
                    <span className="font-mono font-semibold text-gray-900">{money(whtTotal)}</span> tax withheld
                    {deniedCount > 0 && <>; {plural(deniedCount, 'refused claim')} stays on the bill for the patient to pay</>}.
                  </>
                )}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRemitting(false)} disabled={busy} className={SECONDARY}>
                  Cancel
                </button>
                <button type="button" onClick={submitRemit} disabled={busy} aria-busy={busy} className={PRIMARY}>
                  <Svg d={ICONS.check} />
                  {busy ? 'Posting…' : 'Post to the bills'}
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="claims-h">
            <div className="border-b border-gray-200 px-5 py-3.5">
              <h2 id="claims-h" className="text-base font-bold tracking-tight text-gray-900">
                Claims
              </h2>
              <p className="text-sm text-gray-500">
                {BATCH_STATUS[b.status].hint}
                {b.status === 'draft' && (
                  <>
                    {' '}
                    <Link href="/hmo-claims" className={LINK}>
                      Add more from To send
                    </Link>
                  </>
                )}
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {b.claims.map((c, i) => {
                const inv = b.invoices?.[c.invoice];
                return (
                  <li key={c.invoice} className="motion-row-in grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-3 text-sm" style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
                    <div className="min-w-0">
                      <Link href={`/invoices/${c.invoice}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        {c.patientName || c.invoiceNumber}
                      </Link>
                      <p className="mt-0.5 truncate font-mono text-xs text-gray-500">
                        {c.invoiceNumber}
                        {c.memberId && ` · member ${c.memberId}`}
                        {c.loaNumber && ` · LOA ${c.loaNumber}`}
                      </p>
                      <p className={`mt-0.5 text-xs ${LINE_TONE[c.status]}`}>
                        {CLAIM_LINE_STATUS[c.status]}
                        {c.status === 'short_paid' && <span className="font-normal"> · the patient owes {money(leftOn(c))}</span>}
                        {c.denialReason && <span className="font-normal text-gray-600"> · “{c.denialReason}”</span>}
                      </p>
                      {inv?.problem && (
                        <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                          <Svg d={ICONS.alert} className="mt-px h-3.5 w-3.5 shrink-0" />
                          {inv.problem}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold tabular-nums text-gray-900">{money(c.amount)}</p>
                      {c.paid + c.withheld > 0 && (
                        <p className="font-mono text-xs tabular-nums text-gray-500">
                          {money(c.paid)} paid{c.withheld > 0 ? ` + ${money(c.withheld)} tax` : ''}
                        </p>
                      )}
                      {b.status === 'draft' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act({ action: 'remove', invoice: c.invoice }, 'Claim taken out; it’s back under To send.')}
                          aria-label={`Take ${c.patientName || c.invoiceNumber} out of this transmittal`}
                          className={`mt-1 rounded text-xs font-semibold text-gray-600 hover:text-red-700 ${FOCUS_RING}`}
                        >
                          Take out
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="payer-h">
              <div className="border-b border-gray-200 px-5 py-3.5">
                <h2 id="payer-h" className="text-base font-bold tracking-tight text-gray-900">
                  Payer
                </h2>
              </div>
              <dl className="divide-y divide-gray-100 text-sm">
                <Fact label="Pays within">{b.hmo ? <span className="font-mono">{b.hmo.paymentTermsDays} days</span> : '—'}</Fact>
                {b.hmo?.contactName && <Fact label="Claims contact">{b.hmo.contactName}</Fact>}
                {b.hmo?.email && (
                  <Fact label="Email">
                    <a href={`mailto:${b.hmo.email}`} className={LINK}>
                      {b.hmo.email}
                    </a>
                  </Fact>
                )}
                {b.hmo?.phone && <Fact label="Phone"><span className="font-mono">{b.hmo.phone}</span></Fact>}
                {b.hmo && (
                  <Fact label="Usually withholds">
                    <span className="font-mono">{b.hmo.withholdingServicesRate}%</span> on services, <span className="font-mono">{b.hmo.withholdingProfessionalRate}%</span> on doctors’ fees
                  </Fact>
                )}
              </dl>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="paid-h">
              <div className="border-b border-gray-200 px-5 py-3.5">
                <h2 id="paid-h" className="text-base font-bold tracking-tight text-gray-900">
                  Payments received
                </h2>
              </div>
              {b.remittances.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gray-500">{b.status === 'draft' ? 'Nothing until it’s sent.' : 'None recorded yet.'}</p>
              ) : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {[...b.remittances].reverse().sort((x, y) => Date.parse(y.date) - Date.parse(x.date)).map((r) => (
                    <li key={r._id} className="px-5 py-3">
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="font-mono tabular-nums text-gray-900">{shortDate(r.date)}</span>
                        <span className="font-mono font-semibold tabular-nums text-gray-900">{money(r.net)}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-gray-500">
                        <span>
                          {r.reference && <span className="font-mono">{r.reference} · </span>}
                          {r.recordedBy ? r.recordedBy.name : 'Recorded'}
                        </span>
                        {r.withheld > 0 && (
                          <span>
                            + <span className="font-mono">{money(r.withheld)}</span> tax ·{' '}
                            <span className={r.form2307Received ? 'text-emerald-800' : 'font-semibold text-amber-800'}>{r.form2307Received ? '2307 received' : '2307 to follow'}</span>
                          </span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <AlertDialog
          open={confirm === 'close'}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`Close ${b.batchNumber}?`}
          description={`Do this when ${b.hmoName} won’t pay any more on it. ${
            open.length
              ? `The ${plural(open.length, 'open claim')} ${open.length === 1 ? 'is' : 'are'} marked refused (or short paid, where part was paid), and ${money(owed)} stays on the bills for the patients to pay.`
              : 'Nothing is still open on it.'
          } This can’t be undone.`}
        >
          <button type="button" onClick={() => setConfirm(null)} className={SECONDARY}>
            Keep it open
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(null);
              act({ action: 'close' }, 'Transmittal closed. What it didn’t pay is back on the patients’ bills.');
            }}
            className={`inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 ${FOCUS_RING}`}
          >
            Close transmittal
          </button>
        </AlertDialog>

        <AlertDialog
          open={confirm === 'discard'}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`Throw away ${b.batchNumber}?`}
          description={`It was never marked sent. Its ${plural(b.claims.length, 'claim')} go back under To send, ready to put in another transmittal.`}
        >
          <button type="button" onClick={() => setConfirm(null)} className={SECONDARY}>
            Keep it
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(null);
              act({ action: 'discard' }, 'Thrown away.');
            }}
            className={`inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 ${FOCUS_RING}`}
          >
            Throw it away
          </button>
        </AlertDialog>
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/hmo-claims?tab=batches" className={`inline-flex w-fit items-center gap-1 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      Transmittals
    </Link>
  );
}

function Figure({ label, value, note, attention }: { label: string; value: string; note: string; attention?: boolean }) {
  return (
    <div className="border-b border-r border-gray-200 px-5 py-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-gray-900">{value}</dd>
      <dd className={`mt-0.5 text-xs ${attention ? 'font-medium text-red-700' : 'text-gray-500'}`}>{note}</dd>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 px-5 py-2.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 text-gray-900">{children}</dd>
    </div>
  );
}
