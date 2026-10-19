'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { Modal } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { useMoney, shortDate } from '../invoices/shared';
import { useSend } from '../admin/users-shared';
import { CASE_RATE_KIND_LABEL, PHILHEALTH_STATUS, type CaseRateKind, type CaseRateRow, type PhilhealthStatus } from '@/lib/philhealth';

interface Claim {
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  pin: string;
  relationship: 'member' | 'dependent';
  caseRateCode: string;
  caseRateDescription?: string;
  hciAmount: number;
  pfAmount: number;
  amount: number;
  servedOn: string;
  status: PhilhealthStatus;
  claimNumber?: string;
  filedAt?: string;
  paidAt?: string;
  paidAmount?: number;
  withheldAmount?: number;
  note?: string;
  daysLeft: number | null;
}
type Tab = 'file' | 'filed' | 'done' | 'rates';
const TABS: { key: Tab; label: string }[] = [
  { key: 'file', label: 'To file' },
  { key: 'filed', label: 'Filed' },
  { key: 'done', label: 'Paid or denied' },
  { key: 'rates', label: 'Case rates' },
];
type Action = { kind: 'file' | 'pay' | 'return' | 'deny'; claim: Claim };

const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const GHOST = `rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`;
const LINK = `rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`;
const OUTLINE = `inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** PhilHealth claims: each claim from bill to payment, against its filing deadline, and the case rates. */
export default function PhilhealthClient({ initialTab, configured }: { initialTab: Tab; configured: boolean }) {
  const { money } = useMoney();
  const [tab, setTab] = useState<Tab>(initialTab);
  const data = useKeyedFetch<{ filingDays: number; claims: Claim[] }>('/api/philhealth/claims');
  const rates = useKeyedFetch<CaseRateRow[]>('/api/philhealth/case-rates');
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const claims = data.value?.claims ?? null;
  const groups = useMemo(() => {
    const c = claims ?? [];
    return {
      file: c.filter((x) => x.status === 'draft' || x.status === 'returned').sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
      filed: c.filter((x) => x.status === 'filed'),
      done: c.filter((x) => x.status === 'paid' || x.status === 'denied').reverse(),
    };
  }, [claims]);
  const late = groups.file.filter((c) => (c.daysLeft ?? 0) < 0).length;
  const soon = groups.file.filter((c) => (c.daysLeft ?? 99) >= 0 && (c.daysLeft ?? 99) <= 7).length;

  const csv = () => {
    const rows = [
      ['Bill', 'Patient', 'PIN', 'Member or dependent', 'Case rate', 'Seen on', 'Facility share', 'Professional fee share', 'Claim', 'Status', 'Claim number', 'Filed', 'Paid', 'Paid amount', 'Withheld'],
      ...(claims ?? []).map((c) => [c.invoiceNumber, c.patientName, c.pin, c.relationship, c.caseRateCode, c.servedOn.slice(0, 10), c.hciAmount, c.pfAmount, c.amount, c.status, c.claimNumber ?? '', c.filedAt?.slice(0, 10) ?? '', c.paidAt?.slice(0, 10) ?? '', c.paidAmount ?? '', c.withheldAmount ?? '']),
    ];
    const text = rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = `philhealth-claims-${todayKey()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">PhilHealth</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">Claims on the clinic’s bills: file each one in eClaims before its deadline, then record what PhilHealth pays.</p>
        </div>
        {claims && claims.length > 0 && (
          <button type="button" onClick={csv} className={OUTLINE}>
            <Svg d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            Download CSV
          </button>
        )}
      </header>

      {!configured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          PhilHealth billing is off for this clinic. Turn it on and enter the accreditation number under{' '}
          <Link href="/admin/settings#philhealth" className="font-semibold underline">
            Settings
          </Link>
          ; invoices then get a PhilHealth section.
        </p>
      )}

      {claims && (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4">
          <Figure label="To file" value={String(groups.file.length)} sub={money(groups.file.reduce((s, c) => s + c.amount, 0))} />
          <Figure label="Past the deadline" value={String(late)} sub={soon ? `${soon} more due within a week` : `${data.value?.filingDays ?? 60}-day filing window`} attention={late > 0} />
          <Figure label="Filed, waiting" value={String(groups.filed.length)} sub={money(groups.filed.reduce((s, c) => s + c.amount, 0))} />
          <Figure label="Paid" value={money(groups.done.reduce((s, c) => s + (c.paidAmount ?? 0) + (c.withheldAmount ?? 0), 0))} sub={`${groups.done.filter((c) => c.status === 'denied').length} denied`} />
        </dl>
      )}

      <div role="tablist" aria-label="PhilHealth" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const on = t.key === tab;
          const n = t.key === 'rates' ? null : groups[t.key].length;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'border-brand-teal-dark text-brand-teal-deep' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}`}
            >
              {t.label}
              {n ? <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {notice && (
        <p role="status" className="motion-panel-in flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`rounded ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </p>
      )}
      {(data.error || rates.error) && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
          This page didn’t load ({data.error || rates.error}).
        </p>
      )}

      {tab === 'rates' ? (
        <CaseRates
          rows={rates.value}
          onSaved={(m) => {
            setNotice(m);
            rates.reload();
          }}
        />
      ) : !claims ? (
        <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
      ) : (
        <ClaimList tab={tab} claims={groups[tab]} money={money} onAct={setAction} />
      )}

      {action && (
        <ActionDialog
          action={action}
          onClose={() => setAction(null)}
          onDone={(m) => {
            setAction(null);
            setNotice(m);
            data.reload();
          }}
        />
      )}
    </div>
  );
}

function Figure({ label, value, sub, attention }: { label: string; value: string; sub: string; attention?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${attention ? 'text-red-700' : 'text-gray-900'}`}>{value}</dd>
      <dd className="mt-0.5 text-xs text-gray-500">{sub}</dd>
    </div>
  );
}

function ClaimList({ tab, claims, money, onAct }: { tab: Exclude<Tab, 'rates'>; claims: Claim[]; money: (n: number) => string; onAct: (a: Action) => void }) {
  if (!claims.length) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white">
        <p className="px-5 py-10 text-center text-sm text-gray-500">
          {tab === 'file' ? 'Nothing to file. Claims appear here when a bill is made with a PhilHealth claim.' : tab === 'filed' ? 'No claims waiting on PhilHealth.' : 'None yet.'}
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-100">
        {claims.map((c) => {
          const st = PHILHEALTH_STATUS[c.status];
          return (
            <li key={c.invoiceId} className="grid gap-x-4 gap-y-2 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/invoices/${c.invoiceId}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {c.patientName}
                  </Link>
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
                </div>
                <p className="mt-0.5 truncate text-gray-500">
                  <span className="font-mono text-xs">{c.pin}</span>
                  {c.relationship === 'dependent' && ' (dependent)'} · <span className="font-mono text-xs">{c.caseRateCode}</span> {c.caseRateDescription} · seen {shortDate(c.servedOn)}
                  {c.claimNumber && <span className="font-mono text-xs"> · claim {c.claimNumber}</span>}
                </p>
                {c.note && <p className={`mt-1 text-xs ${c.status === 'returned' ? 'font-medium text-amber-800' : 'text-gray-600'}`}>{c.note}</p>}
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <p className="font-mono font-semibold tabular-nums text-gray-900">{money(c.amount)}</p>
                {c.daysLeft !== null && (
                  <p className={`font-mono text-xs tabular-nums ${c.daysLeft < 0 ? 'font-semibold text-red-700' : c.daysLeft <= 7 ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>
                    {c.daysLeft < 0 ? `${-c.daysLeft} days late` : c.daysLeft === 0 ? 'due today' : `${c.daysLeft} days left`}
                  </p>
                )}
                {c.status === 'paid' && (
                  <p className="font-mono text-xs tabular-nums text-gray-500">
                    paid {money(c.paidAmount ?? 0)}
                    {(c.withheldAmount ?? 0) > 0 && ` + ${money(c.withheldAmount ?? 0)} withheld`}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <a href={`/api/philhealth/claims/${c.invoiceId}/worksheet`} target="_blank" rel="noopener noreferrer" className={LINK}>
                    Worksheet
                  </a>
                  {(c.status === 'draft' || c.status === 'returned') && (
                    <button type="button" onClick={() => onAct({ kind: 'file', claim: c })} className={LINK}>
                      Mark filed
                    </button>
                  )}
                  {c.status === 'filed' && (
                    <>
                      <button type="button" onClick={() => onAct({ kind: 'pay', claim: c })} className={LINK}>
                        Record payment
                      </button>
                      <button type="button" onClick={() => onAct({ kind: 'return', claim: c })} className={LINK}>
                        Returned
                      </button>
                    </>
                  )}
                  {(c.status === 'filed' || c.status === 'returned' || c.status === 'draft') && (
                    <button type="button" onClick={() => onAct({ kind: 'deny', claim: c })} className={`rounded text-sm font-semibold text-gray-600 hover:text-red-700 ${FOCUS_RING}`}>
                      Denied
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ACTION_TITLE: Record<Action['kind'], string> = {
  file: 'Mark the claim filed',
  pay: 'Record PhilHealth’s payment',
  return: 'PhilHealth returned the claim',
  deny: 'PhilHealth denied the claim',
};

function ActionDialog({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: (message: string) => void }) {
  const ids = useId();
  const { money } = useMoney();
  const send = useSend('The claim couldn’t be updated');
  const c = action.claim;
  const [claimNumber, setClaimNumber] = useState(c.claimNumber ?? '');
  const [date, setDate] = useState(todayKey);
  const [amount, setAmount] = useState(String(c.amount));
  const [withheld, setWithheld] = useState('0');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let body: Record<string, unknown>;
    if (action.kind === 'file') body = { action: 'file', claimNumber: claimNumber.trim() || undefined, filedAt: date };
    else if (action.kind === 'pay') {
      const a = Number(amount);
      const w = withheld.trim() === '' ? 0 : Number(withheld);
      if (!Number.isFinite(a) || a < 0 || !Number.isFinite(w) || w < 0) return setError('Enter amounts of 0 or more.');
      if (a + w > c.amount + 0.005) return setError(`That’s more than the claim (${money(c.amount)}).`);
      body = { action: 'pay', amount: Math.round(a * 100) / 100, withheld: Math.round(w * 100) / 100, date, reference: reference.trim() || undefined };
    } else if (action.kind === 'return') {
      if (!note.trim()) return setError('Say what PhilHealth asked to be corrected.');
      body = { action: 'return', note: note.trim() };
    } else body = { action: 'deny', note: note.trim() || undefined };
    setBusy(true);
    setError(null);
    const r = await send(`/api/philhealth/claims/${c.invoiceId}`, 'PUT', body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(
      action.kind === 'file'
        ? `Filed the claim for ${c.patientName}.`
        : action.kind === 'pay'
          ? `Recorded PhilHealth’s payment on ${c.invoiceNumber}.`
          : action.kind === 'return'
            ? `Returned. Correct the bill, then file it again.`
            : `Denied. The patient owes ${money(c.amount)} on ${c.invoiceNumber}.`
    );
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-lg" labelledBy={`${ids}-t`} closeOnBackdrop={false}>
      <form onSubmit={submit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-t`} className="text-lg font-bold tracking-tight text-gray-900">
            {ACTION_TITLE[action.kind]}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {c.patientName} · {c.invoiceNumber} · {money(c.amount)}
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          {action.kind === 'file' && (
            <>
              <Field id={`${ids}-n`} label="Claim series number" optional>
                <input id={`${ids}-n`} value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} maxLength={200} className={`${FIELD} font-mono`} />
              </Field>
              <Field id={`${ids}-d`} label="Filed on">
                <input id={`${ids}-d`} type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={`${FIELD} font-mono`} />
              </Field>
            </>
          )}
          {action.kind === 'pay' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={`${ids}-a`} label="Paid">
                  <input id={`${ids}-a`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${FIELD} text-right font-mono tabular-nums`} />
                </Field>
                <Field id={`${ids}-w`} label="Tax withheld">
                  <input id={`${ids}-w`} inputMode="decimal" value={withheld} onChange={(e) => setWithheld(e.target.value)} className={`${FIELD} text-right font-mono tabular-nums`} />
                </Field>
                <Field id={`${ids}-d`} label="Received on">
                  <input id={`${ids}-d`} type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={`${FIELD} font-mono`} />
                </Field>
                <Field id={`${ids}-r`} label="Reference" optional>
                  <input id={`${ids}-r`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} className={`${FIELD} font-mono`} />
                </Field>
              </div>
              <p className="text-xs text-gray-500">Posted to the bill as a PhilHealth payment, and any tax withheld as creditable withholding.</p>
            </>
          )}
          {(action.kind === 'return' || action.kind === 'deny') && (
            <Field id={`${ids}-note`} label={action.kind === 'return' ? 'What needs correcting' : 'Reason'} optional={action.kind === 'deny'}>
              <textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={FIELD} />
            </Field>
          )}
          {action.kind === 'deny' && <p className="text-sm text-amber-800">The {money(c.amount)} PhilHealth was to pay stays on the bill for the patient.</p>}
          {error && <FieldError id={`${ids}-err`}>{error}</FieldError>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
            <Svg d={ICON.check} />
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ id, label, optional, children }: { id: string; label: string; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function CaseRates({ rows, onSaved }: { rows: CaseRateRow[] | null; onSaved: (m: string) => void }) {
  const { money } = useMoney();
  const [editing, setEditing] = useState<{ row: CaseRateRow | null } | null>(null);
  if (!rows) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />;
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
        <div>
          <h2 className="text-base font-bold tracking-tight text-gray-900">Case rates</h2>
          <p className="text-sm text-gray-500">From PhilHealth’s circulars for the cases the clinic bills. A change applies to bills made from then on.</p>
        </div>
        <button type="button" onClick={() => setEditing({ row: null })} className={OUTLINE}>
          <Svg d="M12 4v16m8-8H4" />
          Add a case rate
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">None yet. Add the case rates the clinic bills, with their facility and professional-fee shares.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                <th scope="col" className="px-5 py-2.5 font-medium">Code</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Case</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Rate</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Facility</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Professional fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r._id} className={r.active ? '' : 'text-gray-400'}>
                  <th scope="row" className="px-5 py-2.5 text-left">
                    <button type="button" onClick={() => setEditing({ row: r })} className={`rounded font-mono font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {r.code}
                    </button>
                  </th>
                  <td className="px-3 py-2.5">
                    {r.description}
                    <span className="block text-xs text-gray-500">
                      {CASE_RATE_KIND_LABEL[r.kind]}
                      {!r.active && ' · retired'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(r.amount)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.hciShare ? money(r.hciShare) : '—'}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{r.pfShare ? money(r.pfShare) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CaseRateDialog
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            onSaved(m);
          }}
        />
      )}
    </section>
  );
}

function CaseRateDialog({ row, onClose, onSaved }: { row: CaseRateRow | null; onClose: () => void; onSaved: (m: string) => void }) {
  const ids = useId();
  const send = useSend('The case rate couldn’t be saved');
  const [f, setF] = useState({
    code: row?.code ?? '',
    kind: (row?.kind ?? 'medical') as CaseRateKind,
    description: row?.description ?? '',
    amount: row ? String(row.amount) : '',
    hciShare: row?.hciShare ? String(row.hciShare) : '',
    pfShare: row?.pfShare ? String(row.pfShare) : '',
    active: row?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = (s: string) => (s.trim() === '' ? 0 : Number(s));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.code.trim() || !f.description.trim()) return setError('Enter the code and what the case is.');
    if (![n(f.amount), n(f.hciShare), n(f.pfShare)].every((v) => Number.isFinite(v) && v >= 0) || f.amount.trim() === '') return setError('Amounts are 0 or more.');
    if (n(f.hciShare) + n(f.pfShare) > n(f.amount) + 0.005) return setError('The two shares add up to more than the case rate.');
    setBusy(true);
    setError(null);
    const body = { code: f.code.trim(), kind: f.kind, description: f.description.trim(), amount: n(f.amount), hciShare: n(f.hciShare), pfShare: n(f.pfShare), active: f.active };
    const r = await send(row ? `/api/philhealth/case-rates/${row._id}` : '/api/philhealth/case-rates', row ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(row ? `Saved ${body.code}.` : `Added ${body.code}.`);
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-lg" labelledBy={`${ids}-t`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-t`} className="text-lg font-bold tracking-tight text-gray-900">
            {row ? row.code : 'Add a case rate'}
          </h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Field id={`${ids}-c`} label="Code">
              <input id={`${ids}-c`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={30} placeholder="e.g. A09.0" className={`${FIELD} font-mono uppercase`} />
            </Field>
            <Field id={`${ids}-k`} label="Kind">
              <select id={`${ids}-k`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CaseRateKind })} className={FIELD}>
                {(Object.keys(CASE_RATE_KIND_LABEL) as CaseRateKind[]).map((k) => (
                  <option key={k} value={k}>
                    {CASE_RATE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id={`${ids}-d`} label="Case">
            <input id={`${ids}-d`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} className={FIELD} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id={`${ids}-a`} label="Case rate">
              <input id={`${ids}-a`} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${FIELD} text-right font-mono tabular-nums`} />
            </Field>
            <Field id={`${ids}-h`} label="Facility share" optional>
              <input id={`${ids}-h`} inputMode="decimal" value={f.hciShare} onChange={(e) => setF({ ...f, hciShare: e.target.value })} className={`${FIELD} text-right font-mono tabular-nums`} />
            </Field>
            <Field id={`${ids}-p`} label="PF share" optional>
              <input id={`${ids}-p`} inputMode="decimal" value={f.pfShare} onChange={(e) => setF({ ...f, pfShare: e.target.value })} className={`${FIELD} text-right font-mono tabular-nums`} />
            </Field>
          </div>
          <p className="text-xs text-gray-500">Without a split, PhilHealth’s benefit is the case rate, up to the whole bill.</p>
          {row && (
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
              <span className="font-medium text-gray-900">Still billed</span>
            </label>
          )}
          {error && <FieldError id={`${ids}-err`}>{error}</FieldError>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className={GHOST}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
            <Svg d={ICON.check} />
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
