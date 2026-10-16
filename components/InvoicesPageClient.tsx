'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { SERIES, TableTwin, TrendChart } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { INVOICE_STATE, shortDate, useMoney } from './invoices/shared';
import { AGING, INVOICE_STATUSES, daysSince, type AgingKey, type InvoiceStatus } from '@/lib/invoices';
import type { InvoicesPagePermissions } from '@/lib/invoices-page';

interface InvoiceRow {
  _id: string;
  invoiceNumber: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  visit?: { _id: string; visitCode: string } | null;
  total?: number;
  totalPaid?: number;
  outstandingBalance?: number;
  status: InvoiceStatus;
  createdAt: string;
}

interface Insights {
  today: string;
  open: { amount: number; count: number };
  aging: { key: AgingKey; amount: number; count: number }[];
  status: Partial<Record<InvoiceStatus, number>>;
  days: { date: string; billed: number; collected: number }[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type StatusFilter = InvoiceStatus | 'open' | '';

const PAGE_SIZE = 20;

const ROW_GRID =
  'lg:grid lg:grid-cols-[6.5rem_minmax(0,1.6fr)_8rem_minmax(0,1.1fr)_6.5rem_3.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

const STATUS_LABEL: Record<Exclude<StatusFilter, ''>, string> = {
  open: 'Still to collect',
  ...Object.fromEntries(INVOICE_STATUSES.map((s) => [s, INVOICE_STATE[s].label])),
} as Record<Exclude<StatusFilter, ''>, string>;

const agingLabel = (k: AgingKey) => AGING.find((a) => a.key === k)!.label;

function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const nums = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export default function InvoicesPageClient({
  canWrite,
  initialStatus,
  initialAging,
  initialSearch,
}: InvoicesPagePermissions & { initialStatus: string; initialAging: AgingKey | null; initialSearch: string }) {
  const router = useRouter();
  const { money, compact } = useMoney();
  const [search, setSearch] = useState(initialSearch);
  const [debounced, setDebounced] = useState(initialSearch);
  const [status, setStatus] = useState<StatusFilter>(initialStatus as StatusFilter);
  const [aging, setAging] = useState<AgingKey | null>(initialAging);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  // --- Data -----------------------------------------------------------------

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (debounced.trim()) params.set('search', debounced.trim());
  if (status) params.set('status', status);
  if (aging) params.set('aging', aging);
  const listUrl = `/api/invoices?${params}`;
  const list = useKeyedFetch<InvoiceRow[]>(listUrl);
  const insights = useKeyedFetch<Insights>('/api/invoices/insights');

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  // --- Filters --------------------------------------------------------------

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (status) chips.push({ key: 'status', label: STATUS_LABEL[status], clear: () => (setStatus(''), setPage(1)) });
  if (aging) chips.push({ key: 'aging', label: `Billed ${agingLabel(aging).toLowerCase()} ago`, clear: () => (setAging(null), setPage(1)) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setStatus('');
    setAging(null);
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Invoices</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">What patients were billed, what they paid, and what is still to collect.</p>
          </div>
          {canWrite && (
            <Link
              href="/invoices/new"
              className={`inline-flex w-fit items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ICONS.plus} />
              New invoice
            </Link>
          )}
        </header>

        {insights.value ? (
          <BillingInsights
            data={insights.value}
            status={status}
            aging={aging}
            money={money}
            compact={compact}
            onOpen={() => {
              setStatus((cur) => (cur === 'open' ? '' : 'open'));
              setPage(1);
            }}
            onAging={(k) => {
              setAging((cur) => (cur === k ? null : k));
              setPage(1);
            }}
          />
        ) : insights.error ? (
          <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
            The billing figures didn&apos;t load ({insights.error}).{' '}
            <button type="button" onClick={insights.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : (
          <div className="h-[340px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                setDebounced(search);
                setPage(1);
              }}
            >
              <label htmlFor="inv-search" className="sr-only">
                Search invoices
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="inv-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, patient code, phone or invoice number"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <label htmlFor="inv-status" className="sr-only">
              Status
            </label>
            <select
              id="inv-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
              className={`${FIELD} sm:w-52`}
            >
              <option value="">Any status</option>
              <option value="open">Still to collect</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INVOICE_STATE[s].label}
                </option>
              ))}
            </select>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Remove filter ${c.label}`}
                  className={`motion-chip-in inline-flex max-w-full items-center gap-1.5 rounded-md bg-brand-teal-light py-1 pl-2.5 pr-1.5 text-sm font-medium text-brand-teal-deep transition-colors hover:bg-brand-teal-light/60 ${FOCUS_RING}`}
                >
                  <span className="truncate">{c.label}</span>
                  <Svg d={ICONS.x} className="h-3.5 w-3.5 shrink-0" />
                </button>
              ))}
              <button type="button" onClick={clearAll} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
                Clear all
              </button>
            </div>
          )}
        </div>

        {list.error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">The invoices didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} invoices${narrowed ? ' match' : ''}.` : ''}
        </p>

        {/* List */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Billed</span>
            <span>Patient</span>
            <span className="text-right">Total</span>
            <span className="text-right">Still to pay</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>

          {!loaded ? (
            list.error ? null : (
              <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="h-4 w-20 rounded bg-gray-100" />
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-40 rounded bg-gray-100" />
                      <span className="block h-3 w-24 rounded bg-gray-50" />
                    </span>
                    <span className="hidden h-3.5 w-24 rounded bg-gray-50 lg:block" />
                    <span className="h-5 w-20 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} canWrite={canWrite} onClear={clearAll} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((inv, i) => (
                <InvoiceRowItem key={inv._id} inv={inv} index={i} money={money} onOpen={() => router.push(`/invoices/${inv._id}`)} />
              ))}
            </ul>
          )}

          {loaded && total > 0 && (
            <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-mono text-gray-900">
                  {firstRow.toLocaleString('en-US')}–{lastRow.toLocaleString('en-US')}
                </span>{' '}
                of <span className="font-mono text-gray-900">{total.toLocaleString('en-US')}</span>
                {narrowed ? ' matching invoices' : ' invoices'}
              </p>
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || list.loading}
                    aria-label="Previous page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevL} />
                  </button>
                  {pageWindow(page, pages).map((n, i) =>
                    n === 'gap' ? (
                      <span key={`g${i}`} className="px-1.5 text-gray-400" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        disabled={list.loading}
                        aria-current={page === n ? 'page' : undefined}
                        aria-label={`Page ${n}`}
                        className={`min-w-9 rounded-md px-2 py-1.5 font-mono text-sm transition-colors ${FOCUS_RING} ${page === n ? 'bg-brand-teal-dark font-semibold text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                      >
                        {n}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages || list.loading}
                    aria-label="Next page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevR} />
                  </button>
                </div>
              )}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * One invoice. The figure the desk acts on is what is still to pay, so it gets its own column;
 * an open balance also says how long ago it was billed, amber from 61 days and red past 90.
 */
function InvoiceRowItem({ inv, index, money, onOpen }: { inv: InvoiceRow; index: number; money: (v: number) => string; onOpen: () => void }) {
  const name = inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : 'Patient record unavailable';
  const refunded = inv.status === 'refunded';
  const st = INVOICE_STATE[inv.status] ?? INVOICE_STATE.unpaid;
  const balance = inv.outstandingBalance ?? 0;
  const paid = inv.totalPaid ?? 0;
  const open = inv.status === 'unpaid' || inv.status === 'partial';
  const age = daysSince(inv.createdAt);

  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="font-mono text-sm font-medium tabular-nums text-gray-900">{shortDate(inv.createdAt)}</span>

      <span className="min-w-0">
        <Link
          href={`/invoices/${inv._id}`}
          className={`block truncate rounded font-semibold hover:text-brand-teal-deep ${refunded ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'} ${FOCUS_RING}`}
        >
          {name}
        </Link>
        <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">
          {inv.invoiceNumber}
          {inv.patient?.patientCode ? ` · ${inv.patient.patientCode}` : ''}
          {inv.visit?.visitCode ? ` · ${inv.visit.visitCode}` : ''}
        </span>
      </span>

      <span className="font-mono text-sm tabular-nums text-gray-900 lg:text-right">
        <span className="text-gray-500 lg:hidden">Total </span>
        {money(inv.total ?? 0)}
      </span>

      <span className="text-sm lg:text-right">
        {refunded ? (
          <span className="text-gray-500">Refunded</span>
        ) : !open ? (
          <span className="text-gray-500">Paid in full</span>
        ) : (
          <>
            <span className="block font-mono font-semibold tabular-nums text-gray-900">
              {money(balance)}
              <span className="font-sans font-normal text-gray-500 lg:hidden"> to pay</span>
            </span>
            <span className={`block text-xs ${age > 90 ? 'font-medium text-red-700' : age > 60 ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
              {paid > 0 && (
                <>
                  <span className="font-mono">{money(paid)}</span> paid ·{' '}
                </>
              )}
              {age === 0 ? 'billed today' : (
                <>
                  <span className="font-mono">{age}</span> {age === 1 ? 'day' : 'days'} open
                </>
              )}
            </span>
          </>
        )}
      </span>

      <span>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
      </span>

      <span className="flex items-center justify-end gap-0.5">
        {!refunded && paid > 0 && (
          <a
            href={`/api/invoices/${inv._id}/receipt`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Print receipt for ${inv.invoiceNumber} (opens in a new tab)`}
            title="Print receipt"
            className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep lg:opacity-60 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS_RING}`}
          >
            <Svg d={ICONS.print} />
          </a>
        )}
        <span className="hidden text-gray-400 transition-colors group-hover:text-gray-700 lg:inline" aria-hidden="true">
          <Svg d={ICONS.chevR} />
        </span>
      </span>
    </li>
  );
}

/**
 * Two questions billing staff ask first: how much is still out (and how old it is), and is money
 * coming in as fast as it is billed. The aging bars filter the list; the trend is read-only.
 */
function BillingInsights({
  data,
  status,
  aging,
  money,
  compact,
  onOpen,
  onAging,
}: {
  data: Insights;
  status: StatusFilter;
  aging: AgingKey | null;
  money: (v: number) => string;
  compact: (v: number) => string;
  onOpen: () => void;
  onAging: (k: AgingKey) => void;
}) {
  const ageMax = Math.max(1, ...data.aging.map((a) => a.amount));
  const old = data.aging.find((a) => a.key === '90+');
  const billed = data.days.reduce((s, d) => s + d.billed, 0);
  const collected = data.days.reduce((s, d) => s + d.collected, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)]">
        {/* Still to collect, by age */}
        <section className="flex flex-col border-r border-b border-gray-200" aria-labelledby="inv-open-h">
          <div className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="inv-open-h" className="text-sm text-gray-600">
                Still to collect
              </h2>
              {data.open.count > 0 && (
                <button type="button" aria-pressed={status === 'open'} onClick={onOpen} className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                  {status === 'open' ? 'Show all' : 'List them'}
                </button>
              )}
            </div>
            <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${data.open.amount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>{money(data.open.amount)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {data.open.count === 0 ? (
                'Every invoice is settled.'
              ) : (
                <>
                  on <span className="font-mono">{data.open.count.toLocaleString('en-US')}</span> {data.open.count === 1 ? 'invoice' : 'invoices'}
                  {old && old.count > 0 && (
                    <span className="font-medium text-red-700">
                      {' '}
                      · <span className="font-mono">{money(old.amount)}</span> over 90 days old
                    </span>
                  )}
                </>
              )}
            </p>

            {data.open.count > 0 && (
              <ul className="mt-4 space-y-1" role="group" aria-label="Filter by how long ago the balance was billed">
                {data.aging.map((a, i) => {
                  const on = aging === a.key;
                  const label = AGING.find((x) => x.key === a.key)!.label;
                  return (
                    <li key={a.key}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={a.count === 0}
                        onClick={() => onAging(a.key)}
                        aria-label={`${label}: ${money(a.amount)} on ${a.count} ${a.count === 1 ? 'invoice' : 'invoices'}${on ? ', filtering' : ''}`}
                        className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className={`min-w-0 truncate ${on ? 'font-semibold text-gray-900' : a.count ? 'text-gray-700' : 'text-gray-400'}`}>
                            {label}
                            {a.count > 0 && <span className="ml-1.5 font-mono text-xs text-gray-500">×{a.count}</span>}
                          </span>
                          <span className={`shrink-0 font-mono tabular-nums ${a.count ? 'text-gray-900' : 'text-gray-400'}`}>{money(a.amount)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                          <span
                            className="motion-bar-grow block h-full rounded-r"
                            style={{ width: `${(a.amount / ageMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: aging && !on ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-auto">
            <TableTwin
              caption="Balances still to collect, by days since billing"
              head={['Billed', 'Invoices', 'Still to collect']}
              rows={data.aging.map((a) => [agingLabel(a.key) + ' ago', a.count, money(a.amount)])}
            />
          </div>
        </section>

        {/* Collected vs billed */}
        <section className="border-r border-b border-gray-200" aria-labelledby="inv-flow-h">
          <div className="px-5 pt-5">
            <h2 id="inv-flow-h" className="text-sm text-gray-600">
              Collected and billed, last 30 days
            </h2>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-3xl font-semibold tabular-nums text-gray-900">{money(collected)}</span>
              <span className="text-sm text-gray-500">
                collected against <span className="font-mono text-gray-900">{money(billed)}</span> billed
              </span>
            </p>
            <p className="mt-1 text-sm text-gray-500">Payments count on the day they were received, including payments on older invoices.</p>
          </div>
          <TrendChart
            days={data.days}
            today={data.today}
            series={[
              { key: 'collected', label: 'Collected', color: SERIES.teal, kind: 'column' },
              { key: 'billed', label: 'Billed', color: SERIES.blue, kind: 'line' },
            ]}
            format={money}
            formatTick={compact}
            caption="Money collected and billed per day, last 30 days"
          />
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, canWrite, onClear }: { narrowed: boolean; canWrite: boolean; onClear: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No invoices match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by invoice number or patient code, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No invoices yet</p>
        <p className="mt-1 text-sm text-gray-500">Closing a visit bills the patient automatically, or you can write an invoice yourself.</p>
        {canWrite && (
          <Link href="/invoices/new" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            New invoice
          </Link>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.doc} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
