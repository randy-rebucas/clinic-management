'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { TableTwin, SERIES } from './dashboards/charts';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { useMoney } from './invoices/shared';
import StockBar from './inventory/StockBar';
import { STATUS_ORDER, STOCK_STATE, categoryLabel, daysLeft, qty, shortDate } from './inventory/shared';
import { EXPIRY, STOCK_CATEGORIES, daysUntil, type ExpiryKey, type InventorySort, type StockCategory, type StockStatus } from '@/lib/inventory';
import type { InventoryPermissions } from '@/lib/inventory-page';

interface Row {
  _id: string;
  name: string;
  category: StockCategory;
  sku?: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  reorderQuantity: number;
  unitCost: number;
  supplier?: string;
  location?: string;
  expiryDate?: string;
  status: StockStatus;
  value: number;
  used30: number;
}

interface Insights {
  status: Partial<Record<StockStatus, number>>;
  items: number;
  value: number;
  reorder: { _id: string; name: string; quantity: number; reorderLevel: number; reorderQuantity: number; unit: string; status: StockStatus }[];
  expiry: { key: ExpiryKey; count: number; value: number }[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type StatusFilter = StockStatus | 'reorder' | '';

const PAGE_SIZE = 25;
const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.3fr)_8rem_7.5rem_7rem_4.5rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  restock: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
};

const SORTS: { value: InventorySort; label: string }[] = [
  { value: 'urgent', label: 'Most urgent first' },
  { value: 'name', label: 'Name' },
  { value: 'expiry', label: 'Expires soonest' },
  { value: 'value', label: 'Highest value' },
];

const STATUS_LABEL: Record<Exclude<StatusFilter, ''>, string> = {
  reorder: 'Needs reordering',
  'in-stock': STOCK_STATE['in-stock'].label,
  'low-stock': STOCK_STATE['low-stock'].label,
  'out-of-stock': STOCK_STATE['out-of-stock'].label,
  expired: STOCK_STATE.expired.label,
};

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

export default function InventoryPageClient({
  canWrite,
  initialStatus,
  initialExpiry,
  initialSearch,
}: InventoryPermissions & { initialStatus: string; initialExpiry: ExpiryKey | null; initialSearch: string }) {
  const router = useRouter();
  const { money } = useMoney();
  const [search, setSearch] = useState(initialSearch);
  const [debounced, setDebounced] = useState(initialSearch);
  const [status, setStatus] = useState<StatusFilter>(initialStatus as StatusFilter);
  const [expiry, setExpiry] = useState<ExpiryKey | null>(initialExpiry);
  const [category, setCategory] = useState<StockCategory | ''>('');
  const [sort, setSort] = useState<InventorySort>('urgent');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort });
  if (debounced.trim()) params.set('search', debounced.trim());
  if (status) params.set('status', status);
  if (expiry) params.set('expiry', expiry);
  if (category) params.set('category', category);
  const listUrl = `/api/inventory?${params}`;
  const list = useKeyedFetch<Row[]>(listUrl);
  const insights = useKeyedFetch<Insights>('/api/inventory/insights');

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (status) chips.push({ key: 'status', label: STATUS_LABEL[status], clear: () => (setStatus(''), setPage(1)) });
  if (expiry) chips.push({ key: 'expiry', label: EXPIRY.find((e) => e.key === expiry)!.chip, clear: () => (setExpiry(null), setPage(1)) });
  if (category) chips.push({ key: 'cat', label: categoryLabel(category), clear: () => (setCategory(''), setPage(1)) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setStatus('');
    setExpiry(null);
    setCategory('');
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Inventory</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Medicines and supplies on hand, what to reorder, and what expires soon.</p>
          </div>
          {canWrite && (
            <Link href="/inventory/new" className={`inline-flex w-fit items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              <Svg d={ICONS.plus} />
              Add item
            </Link>
          )}
        </header>

        {insights.value ? (
          <StockInsights
            data={insights.value}
            status={status}
            expiry={expiry}
            money={money}
            onStatus={(s) => {
              setStatus((cur) => (cur === s ? '' : s));
              setPage(1);
            }}
            onExpiry={(k) => {
              setExpiry((cur) => (cur === k ? null : k));
              setPage(1);
            }}
          />
        ) : insights.error ? (
          <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
            The stock figures didn&apos;t load ({insights.error}).{' '}
            <button type="button" onClick={insights.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : (
          <div className="h-[260px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
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
                Search inventory
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="inv-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, supplier or storage place"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
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
                className={`${FIELD} lg:w-44`}
              >
                <option value="">Any status</option>
                <option value="reorder">Needs reordering</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STOCK_STATE[s].label}
                  </option>
                ))}
              </select>
              <label htmlFor="inv-cat" className="sr-only">
                Category
              </label>
              <select
                id="inv-cat"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as StockCategory | '');
                  setPage(1);
                }}
                className={`${FIELD} lg:w-40`}
              >
                <option value="">Any category</option>
                {STOCK_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <label htmlFor="inv-sort" className="sr-only">
                Sort by
              </label>
              <select
                id="inv-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as InventorySort);
                  setPage(1);
                }}
                className={`${FIELD} lg:w-48`}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
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
            <p className="text-sm font-medium text-red-800">The inventory didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} items${narrowed ? ' match' : ''}.` : ''}
        </p>

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Item</span>
            <span>On hand · reorder at the tick</span>
            <span>Expires</span>
            <span className="text-right">Value at cost</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>

          {!loaded ? (
            list.error ? null : (
              <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-44 rounded bg-gray-100" />
                      <span className="block h-3 w-24 rounded bg-gray-50" />
                    </span>
                    <span className="hidden h-3 w-40 rounded bg-gray-100 lg:block" />
                    <span className="h-5 w-20 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} canWrite={canWrite} onClear={clearAll} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((r, i) => (
                <ItemRow key={r._id} row={r} index={i} money={money} canWrite={canWrite} onOpen={() => router.push(`/inventory/${r._id}`)} />
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
                {narrowed ? ' matching items' : ' items'}
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

function ItemRow({ row: r, index, money, canWrite, onOpen }: { row: Row; index: number; money: (v: number) => string; canWrite: boolean; onOpen: () => void }) {
  const st = STOCK_STATE[r.status] ?? STOCK_STATE['in-stock'];
  const left = daysLeft(r.quantity, r.used30);
  const until = r.expiryDate ? daysUntil(r.expiryDate) : null;
  const needsStock = r.status === 'low-stock' || r.status === 'out-of-stock' || r.status === 'expired';

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
      <span className="min-w-0">
        <Link href={`/inventory/${r._id}`} className={`block truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
          {r.name}
        </Link>
        <span className="mt-0.5 block truncate text-xs text-gray-500">
          {categoryLabel(r.category)}
          {r.sku && <span className="font-mono"> · {r.sku}</span>}
          {r.location && ` · ${r.location}`}
        </span>
      </span>

      <span className="min-w-0">
        <span className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-gray-900">
            <span className="font-mono font-semibold tabular-nums">{qty(r.quantity)}</span> <span className="text-gray-500">{r.unit}</span>
          </span>
          <span className="font-mono text-xs tabular-nums text-gray-500">reorder at {qty(r.reorderLevel)}</span>
        </span>
        <StockBar quantity={r.quantity} reorderLevel={r.reorderLevel} status={r.status} delay={Math.min(index * 18, 220)} className="mt-1" />
        {left !== null && r.quantity > 0 && (
          <span className={`mt-0.5 block text-xs ${left < 7 ? 'font-medium text-red-700' : left < 14 ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
            Lasts about <span className="font-mono">{left}</span> {left === 1 ? 'day' : 'days'} at the current rate
          </span>
        )}
      </span>

      <span className="text-sm">
        {r.expiryDate ? (
          <>
            <span className={`block font-mono tabular-nums ${until !== null && until < 0 ? 'text-red-700 line-through decoration-red-300' : 'text-gray-900'}`}>{shortDate(r.expiryDate)}</span>
            {until !== null && r.quantity > 0 && until <= 90 && (
              <span className={`block text-xs ${until < 0 ? 'font-medium text-red-700' : until <= 30 ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
                {until < 0 ? 'Expired' : until === 0 ? 'Expires today' : (
                  <>
                    in <span className="font-mono">{until}</span> {until === 1 ? 'day' : 'days'}
                  </>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400">No expiry</span>
        )}
      </span>

      <span className="font-mono text-sm tabular-nums text-gray-900 lg:text-right">
        <span className="font-sans text-gray-500 lg:hidden">Value </span>
        {money(r.value)}
      </span>

      <span>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
      </span>

      <span className="flex items-center justify-end gap-0.5">
        {canWrite && needsStock && (
          <Link
            href={`/inventory/${r._id}/restock`}
            aria-label={`Restock ${r.name}`}
            title="Restock"
            className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep lg:opacity-60 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${FOCUS_RING}`}
          >
            <Svg d={ICONS.restock} />
          </Link>
        )}
        <span className="hidden text-gray-400 transition-colors group-hover:text-gray-700 lg:inline" aria-hidden="true">
          <Svg d={ICONS.chevR} />
        </span>
      </span>
    </li>
  );
}

/**
 * The three questions whoever keeps the stock asks: what state is it in (and what is it worth),
 * what must be reordered now, and what expires before it can be used. Status and expiry filter
 * the list; the reorder panel names the items themselves.
 */
function StockInsights({
  data,
  status,
  expiry,
  money,
  onStatus,
  onExpiry,
}: {
  data: Insights;
  status: StatusFilter;
  expiry: ExpiryKey | null;
  money: (v: number) => string;
  onStatus: (s: Exclude<StatusFilter, ''>) => void;
  onExpiry: (k: ExpiryKey) => void;
}) {
  const present = STATUS_ORDER.filter((k) => (data.status[k] || 0) > 0);
  const toReorder = (data.status['low-stock'] || 0) + (data.status['out-of-stock'] || 0);
  const expMax = Math.max(1, ...data.expiry.map((e) => e.count));
  const expiring = data.expiry.reduce((s, e) => s + e.count, 0);
  const expired = data.expiry.find((e) => e.key === 'expired');

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        {/* Status + value */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="stk-status-h">
          <h2 id="stk-status-h" className="text-sm text-gray-600">
            Stock on hand, at cost
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{money(data.value)}</p>
          <p className="mt-1 text-sm text-gray-500">
            across <span className="font-mono">{data.items.toLocaleString('en-US')}</span> {data.items === 1 ? 'item' : 'items'}
          </p>
          {data.items > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
                {present.map((k, i) => (
                  <span
                    key={k}
                    className={`motion-seg-grow h-full transition-opacity duration-200 ${STOCK_STATE[k].fill ? '' : 'ring-1 ring-inset ring-red-300'}`}
                    style={{ flexGrow: data.status[k], flexBasis: 0, background: STOCK_STATE[k].fill ?? '#FFFFFF', opacity: status && status !== 'reorder' && status !== k ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                  />
                ))}
              </div>
              <ul className="mt-3 divide-y divide-gray-100" role="group" aria-label="Filter by status">
                {present.map((k) => {
                  const on = status === k;
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => onStatus(k)}
                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded px-2 py-1.5 text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-center gap-2 text-gray-700">
                          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${STOCK_STATE[k].fill ? '' : 'ring-1 ring-inset ring-red-400'}`} style={{ background: STOCK_STATE[k].fill ?? '#FFFFFF' }} />
                          <span className={on ? 'font-semibold text-gray-900' : ''}>{STOCK_STATE[k].label}</span>
                        </span>
                        <span className="font-mono tabular-nums text-gray-900">{(data.status[k] || 0).toLocaleString('en-US')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* Reorder now */}
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="stk-reorder-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="stk-reorder-h" className="text-sm text-gray-600">
              Needs reordering
            </h2>
            {toReorder > 0 && (
              <button type="button" aria-pressed={status === 'reorder'} onClick={() => onStatus('reorder')} className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                {status === 'reorder' ? 'Show all' : 'List them'}
              </button>
            )}
          </div>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toReorder ? 'text-gray-900' : 'text-gray-500'}`}>{toReorder.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {toReorder === 0 ? 'Everything is above its reorder level.' : (
              <>
                {data.status['out-of-stock'] ? (
                  <span className="font-medium text-red-700">
                    <span className="font-mono">{data.status['out-of-stock']}</span> out of stock
                  </span>
                ) : (
                  'None out of stock'
                )}
                {', furthest under first'}
              </>
            )}
          </p>
          {data.reorder.length > 0 && (
            <ul className="mt-3 space-y-2.5">
              {data.reorder.map((r, i) => (
                <li key={r._id}>
                  <Link href={`/inventory/${r._id}`} className={`-mx-2 block rounded px-2 py-1 hover:bg-gray-50 ${FOCUS_RING}`}>
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-gray-700">{r.name}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">
                        <span className={r.quantity === 0 ? 'font-semibold text-red-700' : 'text-gray-900'}>{qty(r.quantity)}</span> / {qty(r.reorderLevel)} {r.unit}
                      </span>
                    </span>
                    <StockBar quantity={r.quantity} reorderLevel={r.reorderLevel} status={r.status} delay={i * 50} className="mt-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Expiry horizon */}
        <section className="flex flex-col border-r border-b border-gray-200" aria-labelledby="stk-exp-h">
          <div className="p-5">
            <h2 id="stk-exp-h" className="text-sm text-gray-600">
              Stock expiring within 6 months
            </h2>
            <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${expiring ? 'text-gray-900' : 'text-gray-500'}`}>{expiring.toLocaleString('en-US')}</p>
            <p className="mt-1 text-sm text-gray-500">
              {expiring === 0 ? 'Nothing on the shelf expires in the next 6 months.' : expired && expired.count > 0 ? (
                <span className="font-medium text-red-700">
                  <span className="font-mono">{expired.count}</span> already expired, worth <span className="font-mono">{money(expired.value)}</span>
                </span>
              ) : (
                `${expiring === 1 ? 'item' : 'items'} with stock left`
              )}
            </p>
            {expiring > 0 && (
              <ul className="mt-3 space-y-1" role="group" aria-label="Filter by how soon stock expires">
                {data.expiry.map((e, i) => {
                  const on = expiry === e.key;
                  const meta = EXPIRY.find((x) => x.key === e.key)!;
                  return (
                    <li key={e.key}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={e.count === 0}
                        onClick={() => onExpiry(e.key)}
                        aria-label={`${meta.label}: ${e.count} ${e.count === 1 ? 'item' : 'items'}, worth ${money(e.value)}${on ? ', filtering' : ''}`}
                        className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                      >
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className={`min-w-0 truncate ${on ? 'font-semibold text-gray-900' : e.count ? (e.key === 'expired' ? 'font-medium text-red-700' : 'text-gray-700') : 'text-gray-400'}`}>{meta.label}</span>
                          <span className={`shrink-0 font-mono tabular-nums ${e.count ? 'text-gray-900' : 'text-gray-400'}`}>{e.count}</span>
                        </span>
                        <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                          <span className="motion-bar-grow block h-full rounded-r" style={{ width: `${(e.count / expMax) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: expiry && !on ? 0.3 : 1, animationDelay: `${i * 60}ms` }} />
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
              caption="Items with stock left, by how soon it expires"
              head={['Expires', 'Items', 'Value at cost']}
              rows={data.expiry.map((e) => [EXPIRY.find((x) => x.key === e.key)!.label, e.count, money(e.value)])}
            />
          </div>
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
        <p className="font-semibold text-gray-900">No items match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by SKU or supplier, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No stock recorded yet</p>
        <p className="mt-1 text-sm text-gray-500">Add the medicines and supplies the clinic keeps. Dispensing then takes medicines off stock automatically.</p>
        {canWrite && (
          <Link href="/inventory/new" className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            Add item
          </Link>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.box} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
