'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { Panel } from './dashboards/shared';
import { RankedBars, SERIES, TableTwin, TrendChart } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { useMoney } from './invoices/shared';
import { STOCK_STATE, categoryLabel, qty } from './inventory/shared';
import { MAX_CUSTOM_DAYS, REPORTS, type ReportKey, type ReportPeriod } from '@/lib/reports';
import type { StockStatus } from '@/lib/inventory';
import { csvCell } from '@/lib/csv';

// ---------------------------------------------------------------------------
// Report shapes (as the /api/reports routes return them)
// ---------------------------------------------------------------------------

interface Ranged {
  range: { start: string; end: string };
  today: string;
}
interface Consultations extends Ranged {
  total: number;
  cancelled: number;
  days: { date: string; visits: number }[];
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byDoctor: Record<string, number>;
}
interface Income extends Ranged {
  collected: number;
  payments: number;
  billed: number;
  invoices: number;
  stillOwed: number;
  discounts: number;
  tax: number;
  professionalFees: number;
  refunded: { count: number; amount: number };
  days: { date: string; collected: number; billed: number }[];
  byMethod: Record<string, number>;
  byCategory: Record<string, number>;
}
interface Claims {
  status: Record<'pending' | 'approved' | 'rejected' | 'paid', { count: number; amount: number }>;
  claims: number;
  avgDaysPending: number;
  byInsurer: { insurer: string; claims: number; amount: number; open: number; paid: number; rejected: number }[];
  oldest: { _id: string; invoiceNumber: string; createdAt: string; ageDays: number; claimStatus: string; claimAmount: number; provider: string; claimNumber?: string; patient?: { firstName: string; lastName: string } }[];
}
interface BirMoney {
  gross: number;
  vatable: number;
  vat: number;
  exempt: number;
  zero: number;
  discount: number;
  net: number;
}
interface BirBooks {
  range: { start: string; end: string };
  truncated: boolean;
  totals: BirMoney & { invoices: number; cancelled: number };
  days: (BirMoney & { date: string; invoices: number; first: string; last: string; cancelled: number })[];
  statutory: { date: string; serialNo: string; invoiceId: string; name: string; kind: 'senior' | 'pwd'; idNumber: string; gross: number; exemptSales: number; discount: number; net: number }[];
  cancelled: { serialNo: string; date: string; invoiceId: string; name: string }[];
}
interface Patients extends Ranged {
  total: number;
  registered: number;
  days: { date: string; registered: number }[];
  ages: { label: string; count: number }[];
  sex: Record<string, number>;
  cities: { city: string; count: number }[];
  onFile: { conditions: number; allergies: number; philHealth: number };
  discounts: { senior: number; pwd: number; membership: number };
}
interface Stock {
  range: { start: string; end: string };
  items: number;
  value: number;
  byCategory: Record<string, number>;
  status: Partial<Record<StockStatus, number>>;
  topValue: { _id: string; name: string; quantity: number; unit: string; value: number }[];
  mostUsed: { _id: string; name: string; unit: string; used: number; cost: number }[];
  restocks: number;
  lostMoves: number;
}

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'custom', label: 'Dates…' },
];
const API_PERIOD: Record<Exclude<ReportPeriod, 'custom'>, string> = { week: 'weekly', month: 'monthly', 'last-month': 'last-month' };

const DOWNLOAD = 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4';
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const count = (n: number) => n.toLocaleString('en-US');
const words = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ') : s);
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type CsvRows = (string | number)[][];

export default function ReportsPageClient({ allowed, initial }: { allowed: ReportKey[]; initial: ReportKey | null }) {
  const { money, compact } = useMoney();
  const [report, setReport] = useState<ReportKey | null>(initial);
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [from, setFrom] = useState(() => localKey(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => localKey(new Date()));
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const meta = REPORTS.find((r) => r.key === report) ?? null;
  const span = Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000) + 1;
  const rangeProblem = period !== 'custom' ? null : !from || !to ? 'Choose both dates.' : span < 1 ? 'The start date is after the end date.' : span > MAX_CUSTOM_DAYS ? `Choose at most ${MAX_CUSTOM_DAYS} days (about three months).` : null;

  const query = !meta?.ranged ? '' : period === 'custom' ? (rangeProblem ? null : `?startDate=${from}&endDate=${to}`) : `?period=${API_PERIOD[period]}`;
  const url = meta && query !== null ? `/api/reports/${meta.path}${query}` : null;
  const data = useKeyedFetch<unknown>(url);
  // A different report's answer never renders under this tab while the new one loads.
  const current = data.value && data.valueUrl?.startsWith(`/api/reports/${meta?.path}`) ? data.value : null;
  const refreshing = data.loading && current !== null;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = allowed.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setReport(allowed[next]);
    tabs.current[next]?.focus();
  };

  let body: { node: ReactNode; csv: CsvRows; range?: { start: string; end: string } } | null = null;
  if (current && report) {
    switch (report) {
      case 'consultations':
        body = consultationsReport(current as Consultations);
        break;
      case 'income':
        body = incomeReport(current as Income, money, compact);
        break;
      case 'hmo-claims':
        body = claimsReport(current as Claims, money);
        break;
      case 'bir':
        body = birReport(current as BirBooks, money);
        break;
      case 'patients':
        body = patientsReport(current as Patients);
        break;
      case 'inventory':
        body = stockReport(current as Stock, money);
        break;
    }
  }

  const download = () => {
    if (!body || !meta) return;
    const csv = body.csv.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    const suffix = body.range ? `${body.range.start.slice(0, 10)}-to-${body.range.end.slice(0, 10)}` : localKey(new Date());
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.key}-${suffix}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (allowed.length === 0 || !report) {
    return (
      <Shell>
        <Title />
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <p className="font-semibold text-gray-900">No reports are available to you</p>
          <p className="mt-1 text-sm text-gray-500">Each report follows the module it covers. Ask a clinic admin if you need billing, patient or inventory figures.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Title />

      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label="Reports" className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {allowed.map((k, i) => {
            const r = REPORTS.find((x) => x.key === k)!;
            const on = k === report;
            return (
              <button
                key={k}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={`rpt-tab-${k}`}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls="rpt-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setReport(k)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'border-brand-teal-dark text-brand-teal-deep' : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {meta?.ranged ? (
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Period" className="inline-flex flex-wrap gap-1 rounded-md border border-gray-200 bg-white p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={period === p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`rounded px-3.5 py-1.5 text-sm font-semibold transition-colors ${FOCUS_RING} ${period === p.value ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="rpt-from" className="sr-only">
                    From
                  </label>
                  <input id="rpt-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${FIELD} w-auto font-mono`} />
                  <span className="text-sm text-gray-500">to</span>
                  <label htmlFor="rpt-to" className="sr-only">
                    To
                  </label>
                  <input id="rpt-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${FIELD} w-auto font-mono`} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">As things stand now; the period doesn’t apply to this report.</p>
          )}
          <button
            type="button"
            onClick={download}
            disabled={!body || data.loading}
            className={`inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Svg d={DOWNLOAD} />
            Download CSV
          </button>
        </div>
        {rangeProblem && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {rangeProblem}
          </p>
        )}
      </div>

      <div id="rpt-panel" role="tabpanel" aria-labelledby={`rpt-tab-${report}`} aria-busy={data.loading} className="flex flex-col gap-6">
        {data.error && !data.loading ? (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">This report didn&apos;t load ({data.error}).</p>
            <button type="button" onClick={data.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICON.refresh} />
              Try again
            </button>
          </div>
        ) : body ? (
          <div className={`flex flex-col gap-6 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {body.range && (
              <p className="text-sm text-gray-600">
                <span className="font-mono text-gray-900">{fmtDay(body.range.start)}</span> to <span className="font-mono text-gray-900">{fmtDay(body.range.end)}</span>
              </p>
            )}
            {body.node}
          </div>
        ) : rangeProblem ? null : (
          <div className="animate-pulse space-y-6" aria-hidden="true">
            <div className="h-28 rounded-lg border border-gray-200 bg-white" />
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
          </div>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function consultationsReport(d: Consultations) {
  const days = d.days.length;
  const doctors = Object.keys(d.byDoctor).length;
  const node = (
    <>
      <Figures
        items={[
          { label: 'Visits', value: count(d.total), sub: d.cancelled ? `${count(d.cancelled)} cancelled, not counted` : 'none cancelled' },
          { label: 'A day on average', value: (d.total / Math.max(1, days)).toFixed(1), sub: `over ${days} ${days === 1 ? 'day' : 'days'}` },
          { label: 'Still open', value: count(d.byStatus.open ?? 0), sub: d.byStatus.draft ? `${count(d.byStatus.draft)} notes still drafts` : 'no drafts', attention: (d.byStatus.draft ?? 0) > 0 },
          { label: 'Doctors seeing patients', value: count(doctors), sub: 'with at least one visit' },
        ]}
      />
      <Panel title="Visits per day">
        <TrendChart days={d.days} today={d.today} series={[{ key: 'visits', label: 'Visits', color: SERIES.teal, kind: 'column' }]} format={count} caption="Visits per day" />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="By doctor">
          <RankedBars values={d.byDoctor} format={count} empty="No visits in this period." label={(k) => k} />
        </Panel>
        <Panel title="By kind of visit">
          <RankedBars values={d.byType} format={count} empty="No visits in this period." label={words} />
        </Panel>
      </div>
    </>
  );
  const csv: CsvRows = [['Day', 'Visits'], ...d.days.map((x) => [x.date, x.visits]), [], ['Doctor', 'Visits'], ...Object.entries(d.byDoctor), [], ['Kind of visit', 'Visits'], ...Object.entries(d.byType).map(([k, v]) => [words(k), v])];
  return { node, csv, range: d.range };
}

function incomeReport(d: Income, money: (v: number) => string, compact: (v: number) => string) {
  const node = (
    <>
      <Figures
        items={[
          { label: 'Collected', value: money(d.collected), sub: `${count(d.payments)} ${d.payments === 1 ? 'payment' : 'payments'} received` },
          { label: 'Billed', value: money(d.billed), sub: `on ${count(d.invoices)} ${d.invoices === 1 ? 'invoice' : 'invoices'} raised` },
          { label: 'Still owed on those', value: money(d.stillOwed), sub: d.billed > 0 ? `${Math.round((d.stillOwed / d.billed) * 100)}% of what was billed` : 'nothing billed', attention: d.stillOwed > 0 },
          { label: 'Discounts given', value: money(d.discounts), sub: d.refunded.count ? `${count(d.refunded.count)} refunded (${money(d.refunded.amount)}) left out` : 'no refunds' },
        ]}
      />
      <Panel title="Collected and billed per day" subtitle="Payments count on the day received, including payments on older invoices.">
        <TrendChart
          days={d.days}
          today={d.today}
          series={[
            { key: 'collected', label: 'Collected', color: SERIES.teal, kind: 'column' },
            { key: 'billed', label: 'Billed', color: SERIES.blue, kind: 'line' },
          ]}
          format={money}
          formatTick={compact}
          caption="Money collected and billed per day"
        />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Collected, by payment method">
          <RankedBars values={d.byMethod} format={money} />
        </Panel>
        <Panel title="Billed, by kind of service" subtitle={d.professionalFees > 0 ? `Plus ${money(d.professionalFees)} in doctors’ professional fees.` : undefined}>
          <RankedBars values={d.byCategory} format={money} empty="No services billed in this period." label={words} />
        </Panel>
      </div>
      <p className="text-sm text-gray-500">
        Tax billed: <span className="font-mono text-gray-900">{money(d.tax)}</span>.{' '}
        <Link href="/invoices?status=open" className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
          See what is still to collect
        </Link>
      </p>
    </>
  );
  const csv: CsvRows = [
    ['Day', 'Collected', 'Billed'],
    ...d.days.map((x) => [x.date, x.collected, x.billed]),
    [],
    ['Payment method', 'Collected'],
    ...Object.entries(d.byMethod),
    [],
    ['Kind of service', 'Billed'],
    ...Object.entries(d.byCategory),
    [],
    ['Total collected', d.collected],
    ['Total billed', d.billed],
    ['Still owed on invoices raised', d.stillOwed],
    ['Discounts', d.discounts],
    ['Tax', d.tax],
    ['Professional fees', d.professionalFees],
  ];
  return { node, csv, range: d.range };
}

function claimsReport(d: Claims, money: (v: number) => string) {
  const open = d.status.pending.amount + d.status.approved.amount;
  const node = (
    <>
      <Figures
        items={[
          { label: 'Waiting on insurers', value: money(open), sub: `${count(d.status.pending.count + d.status.approved.count)} claims pending or approved, not yet paid`, attention: open > 0 },
          { label: 'Pending, on average', value: `${d.avgDaysPending} days`, sub: `${count(d.status.pending.count)} still pending` },
          { label: 'Paid by insurers', value: money(d.status.paid.amount), sub: `${count(d.status.paid.count)} claims` },
          { label: 'Rejected', value: count(d.status.rejected.count), sub: money(d.status.rejected.amount), attention: d.status.rejected.count > 0 },
        ]}
      />
      <Panel title="By insurer" subtitle={`${count(d.claims)} claims to date, refunded invoices left out.`}>
        {d.byInsurer.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No invoices are billed to an insurer or HMO yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                  <th scope="col" className="px-5 py-2.5 font-medium">Insurer</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Claims</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Waiting</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Paid</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Rejected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.byInsurer.map((r) => (
                  <tr key={r.insurer}>
                    <th scope="row" className="px-5 py-2.5 text-left font-semibold text-gray-900">{r.insurer}</th>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{count(r.claims)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(r.open)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(r.paid)}</td>
                    <td className={`px-5 py-2.5 text-right font-mono tabular-nums ${r.rejected ? 'font-semibold text-red-700' : 'text-gray-500'}`}>{count(r.rejected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {d.oldest.length > 0 && (
        <Panel title="Waiting longest" subtitle="Pending or approved and not yet paid, oldest first.">
          <ol className="divide-y divide-gray-100">
            {d.oldest.map((c, i) => (
              <li key={c._id} className="motion-row-in grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-3 text-sm" style={{ animationDelay: `${Math.min(i * 25, 240)}ms` }}>
                <div className="min-w-0">
                  <Link href={`/invoices/${c._id}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : 'Patient record unavailable'}
                  </Link>
                  <p className="mt-0.5 truncate text-gray-500">
                    {c.provider} · <span className="font-mono text-xs">{c.invoiceNumber}</span>
                    {c.claimNumber && <span className="font-mono text-xs"> · claim {c.claimNumber}</span>} · {words(c.claimStatus)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold tabular-nums text-gray-900">{money(c.claimAmount)}</p>
                  <p className={`font-mono text-xs tabular-nums ${c.ageDays > 60 ? 'font-semibold text-red-700' : c.ageDays > 30 ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>{c.ageDays} days</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  );
  const csv: CsvRows = [
    ['Insurer', 'Claims', 'Amount claimed', 'Waiting', 'Paid', 'Rejected'],
    ...d.byInsurer.map((r) => [r.insurer, r.claims, r.amount, r.open, r.paid, r.rejected]),
    [],
    ['Oldest open claims'],
    ['Invoice', 'Patient', 'Insurer', 'Claim number', 'Status', 'Amount', 'Days'],
    ...d.oldest.map((c) => [c.invoiceNumber, c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : '', c.provider, c.claimNumber ?? '', c.claimStatus, c.claimAmount, c.ageDays]),
  ];
  return { node, csv };
}

function birReport(d: BirBooks, money: (v: number) => string) {
  const t = d.totals;
  const th = 'px-3 py-2.5 text-right font-medium';
  const td = 'px-3 py-2 text-right font-mono tabular-nums text-gray-900';
  const node = (
    <>
      <Figures
        items={[
          { label: 'Sales invoices issued', value: count(t.invoices), sub: t.cancelled ? `${count(t.cancelled)} cancelled (refunded), not counted` : 'none cancelled' },
          { label: 'Net sales', value: money(t.net), sub: `from ${money(t.gross)} gross` },
          { label: 'Output VAT', value: money(t.vat), sub: `on ${money(t.vatable)} VATable sales` },
          { label: 'Senior citizen and PWD', value: count(d.statutory.length), sub: `${money(d.statutory.reduce((s, x) => s + x.discount, 0))} discounts given` },
        ]}
      />
      {d.truncated && <p className="text-sm font-medium text-amber-800">Only the first 5,000 invoices are shown. Choose a shorter period.</p>}
      <Panel title="Sales book" subtitle="Invoices by the day they were issued, with the first and last serial of each day.">
        {d.days.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No sales invoices were issued in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                  <th scope="col" className="px-5 py-2.5 font-medium">Day</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Serials</th>
                  <th scope="col" className={th}>Gross</th>
                  <th scope="col" className={th}>VATable</th>
                  <th scope="col" className={th}>VAT</th>
                  <th scope="col" className={th}>VAT-exempt</th>
                  <th scope="col" className={th}>Zero-rated</th>
                  <th scope="col" className={th}>Discounts</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.days.map((r) => (
                  <tr key={r.date}>
                    <th scope="row" className="whitespace-nowrap px-5 py-2 text-left font-semibold text-gray-900">{fmtDay(`${r.date}T12:00:00`)}</th>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">
                      {r.first === r.last ? r.first : `${r.first} – ${r.last}`}
                      {r.cancelled > 0 && <span className="ml-1 font-sans text-amber-800">({r.cancelled} cancelled)</span>}
                    </td>
                    <td className={td}>{money(r.gross)}</td>
                    <td className={td}>{money(r.vatable)}</td>
                    <td className={td}>{money(r.vat)}</td>
                    <td className={td}>{money(r.exempt)}</td>
                    <td className={td}>{money(r.zero)}</td>
                    <td className={td}>{money(r.discount)}</td>
                    <td className="px-5 py-2 text-right font-mono font-semibold tabular-nums text-gray-900">{money(r.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-semibold">
                  <th scope="row" colSpan={2} className="px-5 py-2.5 text-left text-gray-900">Total</th>
                  <td className={td}>{money(t.gross)}</td>
                  <td className={td}>{money(t.vatable)}</td>
                  <td className={td}>{money(t.vat)}</td>
                  <td className={td}>{money(t.exempt)}</td>
                  <td className={td}>{money(t.zero)}</td>
                  <td className={td}>{money(t.discount)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums text-gray-900">{money(t.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Senior citizen and PWD sales book" subtitle="Each sale with the statutory discount, as BIR asks clinics to keep.">
        {d.statutory.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No senior citizen or PWD discounts on invoices issued in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                  <th scope="col" className="px-5 py-2.5 font-medium">Day</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">ID</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Serial</th>
                  <th scope="col" className={th}>Gross</th>
                  <th scope="col" className={th}>VAT-exempt sale</th>
                  <th scope="col" className={th}>Discount</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.statutory.map((r) => (
                  <tr key={r.serialNo}>
                    <td className="whitespace-nowrap px-5 py-2 text-gray-600">{fmtDay(`${r.date}T12:00:00`)}</td>
                    <th scope="row" className="px-3 py-2 text-left font-semibold text-gray-900">
                      <Link href={`/invoices/${r.invoiceId}`} className={`rounded hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        {r.name || 'Patient record unavailable'}
                      </Link>
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">
                      {r.kind === 'senior' ? 'OSCA' : 'PWD'} {r.idNumber || <span className="font-sans font-semibold text-red-700">missing</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">{r.serialNo}</td>
                    <td className={td}>{money(r.gross)}</td>
                    <td className={td}>{money(r.exemptSales)}</td>
                    <td className={td}>{money(r.discount)}</td>
                    <td className="px-5 py-2 text-right font-mono font-semibold tabular-nums text-gray-900">{money(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {d.cancelled.length > 0 && (
        <Panel title="Cancelled" subtitle="Issued, then refunded. Kept in the books so no serial goes missing.">
          <ul className="divide-y divide-gray-100 text-sm">
            {d.cancelled.map((c) => (
              <li key={c.serialNo} className="flex items-baseline justify-between gap-4 px-5 py-2">
                <Link href={`/invoices/${c.invoiceId}`} className={`rounded font-mono text-xs font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                  {c.serialNo}
                </Link>
                <span className="min-w-0 flex-1 truncate text-gray-600">{c.name}</span>
                <span className="text-gray-500">{fmtDay(`${c.date}T12:00:00`)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
  const csv: CsvRows = [
    ['Sales book'],
    ['Day', 'First serial', 'Last serial', 'Invoices', 'Cancelled', 'Gross sales', 'VATable sales', 'VAT', 'VAT-exempt sales', 'Zero-rated sales', 'Discounts', 'Net sales'],
    ...d.days.map((r) => [r.date, r.first, r.last, r.invoices, r.cancelled, r.gross, r.vatable, r.vat, r.exempt, r.zero, r.discount, r.net]),
    ['Total', '', '', t.invoices, t.cancelled, t.gross, t.vatable, t.vat, t.exempt, t.zero, t.discount, t.net],
    [],
    ['Senior citizen and PWD sales book'],
    ['Day', 'Name', 'Kind', 'OSCA / PWD ID', 'Sales invoice', 'Gross sales', 'VAT-exempt sale', 'Discount', 'Net sales'],
    ...d.statutory.map((r) => [r.date, r.name, r.kind === 'senior' ? 'Senior citizen' : 'PWD', r.idNumber, r.serialNo, r.gross, r.exemptSales, r.discount, r.net]),
    [],
    ['Cancelled sales invoices'],
    ['Serial', 'Day', 'Name'],
    ...d.cancelled.map((c) => [c.serialNo, c.date, c.name]),
  ];
  return { node, csv, range: d.range };
}

function patientsReport(d: Patients) {
  const pct = (n: number) => (d.total ? `${Math.round((n / d.total) * 100)}% of patients` : '');
  const sexLabel: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other', unspecified: 'Not recorded' };
  const node = (
    <>
      <Figures
        items={[
          { label: 'Registered in this period', value: count(d.registered), sub: `${count(d.total)} patients in all` },
          { label: 'Senior citizens', value: count(d.discounts.senior), sub: `by ID or by age 60+ · ${pct(d.discounts.senior)}` },
          { label: 'PWD', value: count(d.discounts.pwd), sub: pct(d.discounts.pwd) || 'none' },
          { label: 'PhilHealth on file', value: count(d.onFile.philHealth), sub: pct(d.onFile.philHealth) || 'none' },
        ]}
      />
      <Panel title="New patients per day">
        <TrendChart days={d.days} today={d.today} series={[{ key: 'registered', label: 'Registered', color: SERIES.teal, kind: 'column' }]} format={count} caption="Patients registered per day" />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Age" subtitle="All patients with a birth date, as of today.">
          <RankedBars values={Object.fromEntries(d.ages.map((a) => [a.label, a.count]))} format={count} empty="No birth dates on file." label={(k) => k} />
        </Panel>
        <Panel title="Home city" subtitle="The eight most common.">
          <RankedBars values={Object.fromEntries(d.cities.map((c) => [c.city, c.count]))} format={count} empty="No addresses on file." label={(k) => k} />
        </Panel>
        <Panel title="On file">
          <dl className="divide-y divide-gray-100 text-sm">
            {[
              ['Sex: ' + Object.entries(d.sex).map(([k, v]) => `${sexLabel[k] ?? k} ${count(v)}`).join(', '), null],
              ['Medical conditions recorded', d.onFile.conditions],
              ['Allergies recorded', d.onFile.allergies],
              ['Membership discount', d.discounts.membership],
            ].map(([label, v], i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 px-5 py-2.5">
                <dt className="text-gray-700">{label}</dt>
                {v !== null && <dd className="font-mono tabular-nums text-gray-900">{count(v as number)}</dd>}
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
  const csv: CsvRows = [
    ['Day', 'Registered'],
    ...d.days.map((x) => [x.date, x.registered]),
    [],
    ['Age', 'Patients'],
    ...d.ages.map((a) => [a.label, a.count]),
    [],
    ['Sex', 'Patients'],
    ...Object.entries(d.sex).map(([k, v]) => [sexLabel[k] ?? k, v]),
    [],
    ['Home city', 'Patients'],
    ...d.cities.map((c) => [c.city, c.count]),
    [],
    ['Senior citizens', d.discounts.senior],
    ['PWD', d.discounts.pwd],
    ['Membership', d.discounts.membership],
    ['PhilHealth on file', d.onFile.philHealth],
    ['Conditions recorded', d.onFile.conditions],
    ['Allergies recorded', d.onFile.allergies],
    ['All patients', d.total],
  ];
  return { node, csv, range: d.range };
}

function stockReport(d: Stock, money: (v: number) => string) {
  const toReorder = (d.status['low-stock'] ?? 0) + (d.status['out-of-stock'] ?? 0);
  const usedCost = d.mostUsed.reduce((s, r) => s + r.cost, 0);
  const node = (
    <>
      <Figures
        items={[
          { label: 'Stock on hand, at cost', value: money(d.value), sub: `across ${count(d.items)} items, as of now` },
          { label: 'Needs reordering', value: count(toReorder), sub: d.status['out-of-stock'] ? `${count(d.status['out-of-stock'])} out of stock` : 'none out of stock', attention: (d.status['out-of-stock'] ?? 0) > 0 },
          { label: 'Restocks in this period', value: count(d.restocks), sub: 'deliveries recorded' },
          { label: 'Thrown away in this period', value: count(d.lostMoves), sub: 'damaged or expired stock taken off', attention: d.lostMoves > 0 },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Used most in this period" subtitle={d.mostUsed.length ? `Dispensed or used in the clinic · about ${money(usedCost)} at cost` : 'Dispensed or used in the clinic.'}>
          {d.mostUsed.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">No use recorded in this period. Use is counted from dispensing and “used in the clinic” adjustments.</p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {d.mostUsed.map((r, i) => (
                <li key={r._id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                  <Link href={`/inventory/${r._id}`} className={`min-w-0 truncate rounded text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    <span className="mr-2 font-mono text-xs text-gray-400">{i + 1}</span>
                    {r.name}
                  </Link>
                  <span className="shrink-0 font-mono tabular-nums text-gray-900">
                    {qty(r.used)} <span className="font-sans text-gray-500">{r.unit}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Stock value, by kind" subtitle="At cost, as of now.">
          <RankedBars values={d.byCategory} format={money} empty="No stock recorded." label={categoryLabel} />
          {d.topValue.length > 0 && (
            <div className="border-t border-gray-100 px-5 py-3">
              <p className="mb-1.5 text-xs font-medium text-gray-500">Most valuable items</p>
              <ul className="space-y-1 text-sm">
                {d.topValue.slice(0, 5).map((r) => (
                  <li key={r._id} className="flex items-baseline justify-between gap-3">
                    <Link href={`/inventory/${r._id}`} className={`min-w-0 truncate rounded text-gray-700 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {r.name}
                    </Link>
                    <span className="shrink-0 font-mono tabular-nums text-gray-900">{money(r.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
      <TableTwin
        caption="Items by status"
        head={['Status', 'Items']}
        rows={(Object.keys(STOCK_STATE) as StockStatus[]).map((k) => [STOCK_STATE[k].label, count(d.status[k] ?? 0)])}
      />
    </>
  );
  const csv: CsvRows = [
    ['Used most', 'Quantity', 'Unit', 'Cost'],
    ...d.mostUsed.map((r) => [r.name, r.used, r.unit, r.cost]),
    [],
    ['Kind', 'Value at cost'],
    ...Object.entries(d.byCategory).map(([k, v]) => [categoryLabel(k), v]),
    [],
    ['Most valuable item', 'On hand', 'Unit', 'Value at cost'],
    ...d.topValue.map((r) => [r.name, r.quantity, r.unit, r.value]),
    [],
    ['Status', 'Items'],
    ...(Object.keys(STOCK_STATE) as StockStatus[]).map((k) => [STOCK_STATE[k].label, d.status[k] ?? 0]),
  ];
  return { node, csv, range: d.range };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Title() {
  return (
    <header>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Reports</h1>
      <p className="mt-1 text-sm sm:text-base text-gray-600">How the clinic is doing, for any period, ready to download.</p>
    </header>
  );
}

/** A ruled row of headline figures. A figure turns its note red only when it needs attention. */
function Figures({ items }: { items: { label: string; value: string; sub: string; attention?: boolean }[] }) {
  return (
    <dl className="grid overflow-hidden rounded-lg border border-gray-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
      {items.map((f, i) => (
        <div key={f.label} className="motion-panel-in -mb-px -mr-px border-b border-r border-gray-200 p-5" style={{ animationDelay: `${i * 40}ms` }}>
          <dt className="text-sm text-gray-600">{f.label}</dt>
          <dd className="mt-2 font-mono text-2xl font-semibold tabular-nums text-gray-900 sm:text-3xl">{f.value}</dd>
          <dd className={`mt-1 text-sm ${f.attention ? 'font-medium text-red-700' : 'text-gray-500'}`}>{f.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
