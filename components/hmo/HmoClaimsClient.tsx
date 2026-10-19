'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { TableTwin } from '../dashboards/charts';
import FilterBar from '../ui/FilterBar';
import { FIELD, FOCUS_RING, Svg } from '../appointments/shared';
import { useMoney, shortDate } from '../invoices/shared';
import { useSend } from '../admin/users-shared';
import PageSizeSelect from '../ui/PageSizeSelect';
import HmoDialog from './HmoDialog';
import { BatchBadge, CHECKBOX, ICONS, LINK, PRIMARY, SECONDARY, ageTone, agoWords, daysAgo, dueWords, plural } from './shared';
import {
  BATCH_SHOWS,
  HMO_KIND_LABEL,
  OWED_AGING,
  type BatchRow,
  type BatchShow,
  type DraftRef,
  type HmoInsights,
  type HmoRow,
  type OpenClaim,
  type OwedAgingKey,
} from '@/lib/hmo';
import { DEFAULT_PAGE_SIZE } from '@/lib/page-size';

export type HmoTab = 'open' | 'batches' | 'hmos';
const TABS: { key: HmoTab; label: string }[] = [
  { key: 'open', label: 'To send' },
  { key: 'batches', label: 'Transmittals' },
  { key: 'hmos', label: 'HMOs' },
];

interface OpenData {
  claims: OpenClaim[];
  drafts: DraftRef[];
  limited: boolean;
}
interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

type Money = (v: number) => string;
const agingLabel = (k: OwedAgingKey) => OWED_AGING.find((a) => a.key === k)!.label;
const showLabel = (s: BatchShow) => BATCH_SHOWS.find((x) => x.key === s)!.label;

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

/**
 * HMO claims: what is billed to payers and not sent yet, the transmittals sent and what each
 * still owes, and the payers the clinic bills. The figures come from every record; the aging,
 * past-due and per-payer bars filter the transmittals.
 */
export default function HmoClaimsClient({
  initial,
}: {
  initial: { tab: HmoTab; show: BatchShow | null; hmo: string | null; aging: OwedAgingKey | null; search: string };
}) {
  const router = useRouter();
  const { money } = useMoney();
  const [tab, setTab] = useState<HmoTab>(initial.tab);
  const [notice, setNotice] = useState<ReactNode>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Transmittal filters
  const [show, setShow] = useState<BatchShow | null>(initial.show);
  const [hmo, setHmo] = useState<string | null>(initial.hmo);
  const [aging, setAging] = useState<OwedAgingKey | null>(initial.aging);
  const [search, setSearch] = useState(initial.search);
  const [debounced, setDebounced] = useState(initial.search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (search === debounced) return;
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, debounced]);

  const insights = useKeyedFetch<HmoInsights>('/api/hmo-claims/insights');
  const hmos = useKeyedFetch<HmoRow[]>('/api/hmos');
  const open = useKeyedFetch<OpenData>(tab === 'open' ? '/api/hmo-claims/open' : null);
  const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
  if (show) params.set('show', show);
  if (hmo) params.set('hmo', hmo);
  if (aging) params.set('aging', aging);
  if (debounced.trim()) params.set('search', debounced.trim());
  const listUrl = `/api/hmo-claims?${params}`;
  const list = useKeyedFetch<BatchRow[]>(tab === 'batches' ? listUrl : null);

  const refresh = () => {
    insights.reload();
    hmos.reload();
    open.reload();
    list.reload();
  };

  const choose = (t: HmoTab) => {
    setTab(t);
    router.replace(t === 'open' ? '/hmo-claims' : `/hmo-claims?tab=${t}`, { scroll: false });
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  const filterBatches = (f: { show?: BatchShow | null; hmo?: string | null; aging?: OwedAgingKey | null }) => {
    if (f.show !== undefined) setShow(f.show);
    if (f.hmo !== undefined) setHmo(f.hmo);
    if (f.aging !== undefined) setAging(f.aging);
    setPage(1);
    choose('batches');
  };

  const hmoName = (id: string | null) => (id ? hmos.value?.find((h) => h._id === id)?.name ?? insights.value?.byHmo.find((h) => h.hmoId === id)?.name ?? 'One HMO' : '');
  const toSendCount = insights.value?.toSend.count ?? 0;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">HMO claims</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            Send what HMOs owe in transmittals, then match each payment, and the tax withheld from it, to the bills.
          </p>
        </header>

        {insights.value ? (
          <ClaimsInsights
            data={insights.value}
            money={money}
            show={show}
            hmo={hmo}
            aging={aging}
            onToSend={() => choose('open')}
            onShow={(s) => filterBatches({ show: show === s ? null : s, aging: null })}
            onAging={(k) => filterBatches({ aging: aging === k ? null : k, show: show === 'draft' || show === 'done' ? null : show })}
            onHmo={(id) => filterBatches({ hmo: hmo === id ? null : id })}
          />
        ) : insights.error ? (
          <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
            The claim figures didn’t load ({insights.error}).{' '}
            <button type="button" onClick={insights.reload} className={LINK}>
              Try again
            </button>
          </p>
        ) : (
          <div className="h-[300px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
        )}

        {notice && (
          <div role="status" className="motion-panel-in flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            <p>{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded ${FOCUS_RING}`}>
              <Svg d={ICONS.x} />
            </button>
          </div>
        )}

        <div role="tablist" aria-label="HMO claims views" className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t, i) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                type="button"
                id={`hmo-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`hmo-panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                {t.label}
                {t.key === 'open' && toSendCount > 0 && <span className="ml-1.5 font-mono text-xs font-medium text-gray-500">{toSendCount.toLocaleString('en-US')}</span>}
                {t.key === 'hmos' && hmos.value && <span className="ml-1.5 font-mono text-xs font-medium text-gray-500">{hmos.value.length}</span>}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`hmo-panel-${tab}`} aria-labelledby={`hmo-tab-${tab}`} className="flex flex-col gap-4">
          {tab === 'open' && (
            <ToSend
              data={open.value}
              error={open.error}
              loading={open.loading}
              onRetry={open.reload}
              hmos={hmos.value ?? []}
              money={money}
              onChanged={(m) => {
                setNotice(m);
                refresh();
              }}
            />
          )}
          {tab === 'batches' && (
            <Transmittals
              rows={list.value}
              rowsUrl={list.valueUrl}
              listUrl={listUrl}
              loading={list.loading}
              error={list.error}
              onRetry={list.reload}
              pagination={(list.raw?.pagination as Pagination | undefined) ?? null}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              search={search}
              onSearch={setSearch}
              onSubmitSearch={() => {
                setDebounced(search);
                setPage(1);
              }}
              show={show}
              hmo={hmo}
              aging={aging}
              hmoName={hmoName}
              hmos={hmos.value ?? []}
              money={money}
              onFilter={(f) => {
                if (f.show !== undefined) setShow(f.show);
                if (f.hmo !== undefined) setHmo(f.hmo);
                if (f.aging !== undefined) setAging(f.aging);
                setPage(1);
              }}
              onClear={() => {
                setShow(null);
                setHmo(null);
                setAging(null);
                setSearch('');
                setDebounced('');
                setPage(1);
              }}
              onOpen={(id) => router.push(`/hmo-claims/${id}`)}
            />
          )}
          {tab === 'hmos' && (
            <Payers
              rows={hmos.value}
              error={hmos.error}
              onRetry={hmos.reload}
              figures={insights.value?.byHmo ?? []}
              money={money}
              onTransmittals={(id) => filterBatches({ hmo: id, show: null, aging: null })}
              onSaved={(m) => {
                setNotice(m);
                refresh();
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/**
 * Three questions billing staff ask first: what haven't we sent, what do HMOs owe us and how
 * late is it, and which HMO is it. The aging, past-due and per-HMO bars filter the transmittals.
 */
function ClaimsInsights({
  data,
  money,
  show,
  hmo,
  aging,
  onToSend,
  onShow,
  onAging,
  onHmo,
}: {
  data: HmoInsights;
  money: Money;
  show: BatchShow | null;
  hmo: string | null;
  aging: OwedAgingKey | null;
  onToSend: () => void;
  onShow: (s: BatchShow) => void;
  onAging: (k: OwedAgingKey) => void;
  onHmo: (id: string) => void;
}) {
  const { toSend, owed } = data;
  const oldest = toSend.oldestAt ? daysAgo(toSend.oldestAt) : null;
  const ageMax = Math.max(1, ...owed.aging.map((a) => a.amount));
  const owing = data.byHmo.filter((h) => h.owed > 0);
  const topOwing = owing.slice(0, 6);
  const hmoMax = Math.max(1, ...topOwing.map((h) => h.owed));

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        {/* Still to send */}
        <section className="flex flex-col border-r border-b border-gray-200 p-5" aria-labelledby="hmo-send-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="hmo-send-h" className="text-sm text-gray-600">
              Not sent to an HMO yet
            </h2>
            {toSend.count > 0 && (
              <button type="button" onClick={onToSend} className={`text-xs ${LINK}`}>
                List them
              </button>
            )}
          </div>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toSend.count ? 'text-gray-900' : 'text-gray-500'}`}>{money(toSend.amount)}</p>
          <p className="mt-1 text-sm text-gray-500">
            {toSend.count === 0 ? (
              'Every claim has gone out.'
            ) : (
              <>
                on <span className="font-mono">{toSend.count.toLocaleString('en-US')}</span> {toSend.count === 1 ? 'claim' : 'claims'}
                {oldest !== null && <span className={ageTone(oldest)}> · oldest {agoWords(oldest, 'billed')}</span>}
              </>
            )}
          </p>
          {(toSend.count > 0 || data.drafts > 0) && (
            <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100 text-sm">
              {toSend.count > 0 && (
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-gray-700">Ready to send</dt>
                  <dd className="font-mono tabular-nums text-gray-900">
                    {toSend.ready.toLocaleString('en-US')}
                    <span className="ml-2 text-gray-500">{money(toSend.readyAmount)}</span>
                  </dd>
                </div>
              )}
              {toSend.needLoa > 0 && (
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="flex items-center gap-1.5 font-medium text-amber-800">
                    <Svg d={ICONS.alert} className="h-3.5 w-3.5 shrink-0" />
                    Waiting for the LOA number
                  </dt>
                  <dd className="font-mono tabular-nums text-amber-800">{toSend.needLoa.toLocaleString('en-US')}</dd>
                </div>
              )}
              {toSend.unlisted > 0 && (
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="flex items-center gap-1.5 font-medium text-amber-800">
                    <Svg d={ICONS.alert} className="h-3.5 w-3.5 shrink-0" />
                    Payer not on the HMO list
                  </dt>
                  <dd className="font-mono tabular-nums text-amber-800">{toSend.unlisted.toLocaleString('en-US')}</dd>
                </div>
              )}
              {data.drafts > 0 && (
                <div className="py-1">
                  <button
                    type="button"
                    aria-pressed={show === 'draft'}
                    onClick={() => onShow('draft')}
                    className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded px-2 py-1 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${show === 'draft' ? 'bg-brand-teal-light/60 font-semibold' : ''}`}
                  >
                    <span className="text-gray-700">In a transmittal, not marked sent</span>
                    <span className="font-mono tabular-nums text-gray-900">{data.drafts.toLocaleString('en-US')}</span>
                  </button>
                </div>
              )}
            </dl>
          )}
        </section>

        {/* Owed, by days since sent */}
        <section className="flex flex-col border-r border-b border-gray-200" aria-labelledby="hmo-owed-h">
          <div className="p-5">
            <h2 id="hmo-owed-h" className="text-sm text-gray-600">
              Owed by HMOs
            </h2>
            <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${owed.amount ? 'text-gray-900' : 'text-gray-500'}`}>{money(owed.amount)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {owed.batches === 0 ? (
                'No transmittal is waiting for payment.'
              ) : (
                <>
                  on <span className="font-mono">{owed.batches}</span> {owed.batches === 1 ? 'transmittal' : 'transmittals'}
                  {owed.pastDue.batches > 0 && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        aria-pressed={show === 'overdue'}
                        onClick={() => onShow('overdue')}
                        className={`rounded font-medium text-red-700 underline-offset-2 hover:underline ${FOCUS_RING} ${show === 'overdue' ? 'underline' : ''}`}
                      >
                        <span className="font-mono">{money(owed.pastDue.amount)}</span> past due
                      </button>
                    </>
                  )}
                </>
              )}
            </p>
            {owed.batches > 0 && (
              <ul className="mt-4 space-y-1" role="group" aria-label="Filter transmittals by days since they were sent">
                {owed.aging.map((a, i) => (
                  <li key={a.key}>
                    <FilterBar
                      index={i}
                      label={`Sent ${agingLabel(a.key).toLowerCase()} ago`}
                      value={money(a.amount)}
                      share={a.amount / ageMax}
                      on={aging === a.key}
                      dim={aging !== null}
                      disabled={a.batches === 0}
                      ariaLabel={`Sent ${agingLabel(a.key).toLowerCase()} ago: ${money(a.amount)} on ${plural(a.batches, 'transmittal')}${aging === a.key ? ', filtering' : ''}`}
                      onClick={() => onAging(a.key)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="mt-auto border-t border-gray-100 px-5 py-2.5 text-sm text-gray-600">
            Received in the last 30 days: <span className="font-mono text-gray-900">{money(data.received30.amount)}</span>
            {data.received30.withheld > 0 && (
              <>
                , <span className="font-mono">{money(data.received30.withheld)}</span> of it withheld tax
              </>
            )}
          </p>
          <TableTwin
            caption="Owed by HMOs, by days since the transmittal was sent"
            head={['Sent', 'Transmittals', 'Still owed']}
            rows={owed.aging.map((a) => [`${agingLabel(a.key)} ago`, a.batches, money(a.amount)])}
          />
        </section>

        {/* By HMO */}
        <section className="flex flex-col border-r border-b border-gray-200" aria-labelledby="hmo-by-h">
          <div className="p-5">
            <h2 id="hmo-by-h" className="text-sm text-gray-600">
              Who owes it
            </h2>
            {topOwing.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No HMO owes the clinic anything right now.</p>
            ) : (
              <ul className="mt-2 space-y-1" role="group" aria-label="Filter transmittals by HMO">
                {topOwing.map((h, i) => {
                  const slow = h.daysToPay !== null && h.daysToPay > h.termsDays;
                  return (
                    <li key={h.hmoId}>
                      <FilterBar
                        index={i}
                        label={h.name}
                        meta={
                          <>
                            {h.pastDue > 0 && (
                              <span className="font-medium text-red-700">
                                <span className="font-mono">{money(h.pastDue)}</span> past due ·{' '}
                              </span>
                            )}
                            {h.daysToPay === null ? (
                              'Hasn’t paid in the last year'
                            ) : (
                              <span className={slow ? 'font-medium text-amber-800' : undefined}>
                                Pays in about <span className="font-mono">{h.daysToPay}</span> days
                                {slow && <> (terms {h.termsDays})</>}
                              </span>
                            )}
                          </>
                        }
                        value={money(h.owed)}
                        share={h.owed / hmoMax}
                        on={hmo === h.hmoId}
                        dim={hmo !== null}
                        ariaLabel={`${h.name}: owes ${money(h.owed)}${h.pastDue > 0 ? `, ${money(h.pastDue)} past due` : ''}${hmo === h.hmoId ? ', filtering' : ''}`}
                        onClick={() => onHmo(h.hmoId)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {owing.length > topOwing.length && (
              <p className="mt-2 text-sm text-gray-500">
                and <span className="font-mono">{owing.length - topOwing.length}</span> more on the HMOs tab
              </p>
            )}
          </div>
          {data.byHmo.length > 0 && (
            <div className="mt-auto">
              <TableTwin
                caption="Each HMO: what it owes, how much is past due, claims not sent, and how long it takes to pay"
                head={['HMO', 'Owed', 'Past due', 'Not sent', 'Days to pay']}
                rows={data.byHmo.map((h) => [h.name, money(h.owed), money(h.pastDue), h.toSend, h.daysToPay ?? '—'])}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// To send
// ---------------------------------------------------------------------------

interface Group {
  key: string;
  hmo: HmoRow | null;
  provider: string;
  claims: OpenClaim[];
}

function ToSend({
  data,
  error,
  loading,
  onRetry,
  hmos,
  money,
  onChanged,
}: {
  data: OpenData | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  hmos: HmoRow[];
  money: Money;
  onChanged: (message: ReactNode) => void;
}) {
  const router = useRouter();
  const send = useSend('That didn’t work');
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [adding, setAdding] = useState<Group | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const c of data?.claims ?? []) {
      const key = c.hmoId ?? `name:${c.provider.trim().toLowerCase()}`;
      const g = m.get(key) ?? { key, hmo: hmos.find((h) => h._id === c.hmoId) ?? null, provider: c.provider.trim(), claims: [] };
      g.claims.push(c);
      m.set(key, g);
    }
    // Payers on the list first (they can be sent), then by how much is waiting.
    return [...m.values()].sort((a, b) => Number(!a.hmo) - Number(!b.hmo) || b.claims.reduce((s, c) => s + c.amount, 0) - a.claims.reduce((s, c) => s + c.amount, 0));
  }, [data, hmos]);

  if (error && !data) {
    return (
      <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">The claims to send didn’t load ({error}).</p>
        <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
          <Svg d={ICONS.refresh} />
          Try again
        </button>
      </div>
    );
  }
  if (!data) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />;
  if (!data.claims.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
          <Svg d={ICONS.send} className="h-5 w-5" />
        </div>
        <p className="font-semibold text-gray-900">Nothing waiting to be sent</p>
        <p className="mt-1 text-sm text-gray-500">A claim appears here when a bill is charged to an HMO, insurer or company account.</p>
      </div>
    );
  }

  const run = async (key: string, req: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>) => {
    setBusy(key);
    setProblem(null);
    const r = await req();
    setBusy(null);
    if (!r.ok) setProblem({ key, message: r.error });
    return r;
  };

  return (
    <div className={`flex flex-col gap-4 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
      {data.limited && (
        <p className="text-sm text-gray-600">
          Showing the oldest <span className="font-mono">1,000</span> claims. Send some, and the rest will follow.
        </p>
      )}
      {groups.map((g, gi) => {
        const ready = g.claims.filter((c) => !c.problem);
        const sel = picked[g.key] ?? new Set(ready.map((c) => c.invoiceId));
        const chosen = ready.filter((c) => sel.has(c.invoiceId));
        const chosenAmount = chosen.reduce((s, c) => s + c.amount, 0);
        const draft = g.hmo ? data.drafts.find((d) => d.hmoId === g.hmo!._id) ?? null : null;
        const setSel = (next: Set<string>) => setPicked((p) => ({ ...p, [g.key]: next }));
        const toggle = (id: string) => {
          const next = new Set(sel);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSel(next);
        };
        const all = ready.length > 0 && chosen.length === ready.length;
        const ids = chosen.map((c) => c.invoiceId);
        const groupBusy = busy === g.key;

        const create = async () => {
          const r = await run(g.key, () => send('/api/hmo-claims', 'POST', { hmo: g.hmo!._id, invoices: ids }));
          if (r.ok) router.push(`/hmo-claims/${(r.data as { _id: string })._id}`);
        };
        const addToDraft = async () => {
          const r = await run(g.key, () => send(`/api/hmo-claims/${draft!._id}`, 'PUT', { action: 'add', invoices: ids }));
          if (!r.ok) return;
          setPicked((p) => {
            const next = { ...p };
            delete next[g.key];
            return next;
          });
          onChanged(
            <>
              Added {plural(ids.length, 'claim')} to {draft!.batchNumber}.{' '}
              <Link href={`/hmo-claims/${draft!._id}`} className="underline underline-offset-2">
                Open it
              </Link>
            </>
          );
        };

        return (
          <section key={g.key} className="motion-panel-in rounded-lg border border-gray-200 bg-white" style={{ animationDelay: `${Math.min(gi * 40, 200)}ms` }} aria-labelledby={`grp-${gi}`}>
            <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                {g.hmo && ready.length > 0 && (
                  <input
                    type="checkbox"
                    aria-label={`Choose every claim to ${g.hmo.name}`}
                    checked={all}
                    ref={(el) => {
                      if (el) el.indeterminate = chosen.length > 0 && !all;
                    }}
                    onChange={() => setSel(all ? new Set() : new Set(ready.map((c) => c.invoiceId)))}
                    className={`mt-1 ${CHECKBOX}`}
                  />
                )}
                <div className="min-w-0">
                  <h2 id={`grp-${gi}`} className="flex flex-wrap items-center gap-2 text-base font-bold tracking-tight text-gray-900">
                    {g.hmo?.name ?? g.provider}
                    {!g.hmo && <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">Not on the HMO list</span>}
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {g.hmo ? (
                      <>
                        {HMO_KIND_LABEL[g.hmo.kind]} · pays within <span className="font-mono">{g.hmo.paymentTermsDays}</span> days{g.hmo.requiresLoa ? ' · LOA on every claim' : ''}
                      </>
                    ) : (
                      'Typed on the bill by hand, so it can’t be sent until it’s on the list.'
                    )}
                  </p>
                </div>
              </div>
              {g.hmo && (
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {draft ? (
                    <>
                      <button type="button" onClick={create} disabled={!chosen.length || busy !== null} className={SECONDARY}>
                        New transmittal
                      </button>
                      <button type="button" onClick={addToDraft} disabled={!chosen.length || busy !== null} aria-busy={groupBusy} className={PRIMARY}>
                        <Svg d={ICONS.plus} />
                        {groupBusy ? 'Adding…' : `Add ${chosen.length} to ${draft.batchNumber}`}
                        {!groupBusy && chosen.length > 0 && <span className="font-mono font-normal opacity-90">· {money(chosenAmount)}</span>}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={create} disabled={!chosen.length || busy !== null} aria-busy={groupBusy} className={PRIMARY}>
                      <Svg d={ICONS.send} />
                      {groupBusy ? 'Making…' : `Put ${chosen.length} in a transmittal`}
                      {!groupBusy && chosen.length > 0 && <span className="font-mono font-normal opacity-90">· {money(chosenAmount)}</span>}
                    </button>
                  )}
                </div>
              )}
            </div>

            {draft && (
              <p className="border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-sm text-gray-600">
                <Link href={`/hmo-claims/${draft._id}`} className={LINK}>
                  {draft.batchNumber}
                </Link>{' '}
                to this HMO holds <span className="font-mono">{draft.claims}</span> {draft.claims === 1 ? 'claim' : 'claims'} and isn’t marked sent yet.
              </p>
            )}

            {!g.hmo && (
              <UnlistedPayer
                group={g}
                hmos={hmos}
                busy={busy}
                onAdd={() => setAdding(g)}
                onLink={async (hmoId, name) => {
                  const r = await run(g.key, () => send('/api/hmo-claims/link', 'POST', { provider: g.provider, hmo: hmoId }));
                  if (r.ok) onChanged(`${plural((r.data as { linked: number }).linked, 'claim')} now billed to ${name}, ready to send.`);
                }}
              />
            )}

            {problem?.key === g.key && (
              <p role="alert" className="flex items-start gap-1.5 border-b border-red-100 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-800">
                <Svg d={ICONS.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {problem.message}
              </p>
            )}

            <ul className="divide-y divide-gray-100">
              {g.claims.map((c, i) => {
                const age = daysAgo(c.createdAt);
                return (
                  <li key={c.invoiceId} className="motion-row-in grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-5 py-3 text-sm" style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
                    <input
                      type="checkbox"
                      aria-label={`Include ${c.patientName}, ${c.invoiceNumber}`}
                      disabled={Boolean(c.problem) || !g.hmo}
                      checked={!c.problem && Boolean(g.hmo) && sel.has(c.invoiceId)}
                      onChange={() => toggle(c.invoiceId)}
                      className={`mt-0.5 ${CHECKBOX}`}
                    />
                    <div className="min-w-0">
                      <Link href={`/invoices/${c.invoiceId}`} className={`rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        {c.patientName}
                      </Link>
                      <p className="mt-0.5 truncate font-mono text-xs text-gray-500">
                        {c.invoiceNumber}
                        {c.memberId && ` · member ${c.memberId}`}
                        {c.loaNumber && ` · LOA ${c.loaNumber}`}
                      </p>
                      {c.problem && g.hmo && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-amber-800">
                          <Svg d={ICONS.alert} className="h-3.5 w-3.5 shrink-0" />
                          {c.problem}
                          <Link href={`/invoices/${c.invoiceId}`} className={`text-xs ${LINK}`}>
                            Add it on the bill
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-semibold tabular-nums text-gray-900">{money(c.amount)}</p>
                      <p className={`text-xs ${ageTone(age)}`}>{agoWords(age, 'billed')}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {adding && (
        <HmoDialog
          row={null}
          rows={hmos}
          name={adding.provider}
          hint={`Its ${plural(adding.claims.length, 'claim')} waiting here will be billed to it once it’s added.`}
          onClose={() => setAdding(null)}
          onSaved={async (_m, saved) => {
            const g = adding;
            setAdding(null);
            const r = await run(g.key, () => send('/api/hmo-claims/link', 'POST', { provider: g.provider, hmo: saved._id }));
            onChanged(r.ok ? `Added ${saved.name} to the HMO list; ${plural((r.data as { linked: number }).linked, 'claim')} ready to send.` : `Added ${saved.name} to the HMO list.`);
          }}
        />
      )}
    </div>
  );
}

/** A payer typed on bills by hand: add it to the list, or say which listed payer it is. */
function UnlistedPayer({ group, hmos, busy, onAdd, onLink }: { group: Group; hmos: HmoRow[]; busy: string | null; onAdd: () => void; onLink: (hmoId: string, name: string) => void }) {
  const [target, setTarget] = useState('');
  const active = hmos.filter((h) => h.active);
  const id = `link-${group.key.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <div className="flex flex-col gap-3 border-b border-gray-100 bg-amber-50/40 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center">
      <button type="button" onClick={onAdd} disabled={busy !== null} className={SECONDARY}>
        <Svg d={ICONS.plus} />
        Add “{group.provider}” to the list
      </button>
      {active.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const h = active.find((x) => x._id === target);
            if (h) onLink(h._id, h.name);
          }}
        >
          <label htmlFor={id} className="text-sm text-gray-600">
            or it’s already there as
          </label>
          <select id={id} value={target} onChange={(e) => setTarget(e.target.value)} className={`${FIELD} w-auto min-w-[12rem] py-1.5`}>
            <option value="">Choose an HMO…</option>
            {active.map((h) => (
              <option key={h._id} value={h._id}>
                {h.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!target || busy !== null} aria-busy={busy === group.key} className={SECONDARY}>
            {busy === group.key ? 'Moving…' : 'Bill them to it'}
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transmittals
// ---------------------------------------------------------------------------

const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem_1.25rem] lg:items-center lg:gap-4';

function Transmittals({
  rows,
  rowsUrl,
  listUrl,
  loading,
  error,
  onRetry,
  pagination,
  page,
  pageSize,
  onPage,
  onPageSize,
  search,
  onSearch,
  onSubmitSearch,
  show,
  hmo,
  aging,
  hmoName,
  hmos,
  money,
  onFilter,
  onClear,
  onOpen,
}: {
  rows: BatchRow[] | null;
  rowsUrl: string | null;
  listUrl: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  pagination: Pagination | null;
  page: number;
  pageSize: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
  search: string;
  onSearch: (v: string) => void;
  onSubmitSearch: () => void;
  show: BatchShow | null;
  hmo: string | null;
  aging: OwedAgingKey | null;
  hmoName: (id: string | null) => string;
  hmos: HmoRow[];
  money: Money;
  onFilter: (f: { show?: BatchShow | null; hmo?: string | null; aging?: OwedAgingKey | null }) => void;
  onClear: () => void;
  onOpen: (id: string) => void;
}) {
  const loaded = rows !== null;
  const refreshing = loading && loaded;
  const total = pagination?.total ?? rows?.length ?? 0;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (show) chips.push({ key: 'show', label: showLabel(show), clear: () => onFilter({ show: null }) });
  if (aging) chips.push({ key: 'aging', label: `Sent ${agingLabel(aging).toLowerCase()} ago`, clear: () => onFilter({ aging: null }) });
  if (hmo) chips.push({ key: 'hmo', label: hmoName(hmo), clear: () => onFilter({ hmo: null }) });
  const narrowed = chips.length > 0 || search.trim() !== '';

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row">
          <form
            role="search"
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitSearch();
            }}
          >
            <label htmlFor="tr-search" className="sr-only">
              Search transmittals
            </label>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Svg d={ICONS.search} />
            </span>
            <input
              id="tr-search"
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search by transmittal, HMO, patient, invoice or LOA number"
              autoComplete="off"
              className={`${FIELD} pl-9`}
            />
          </form>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
            <label htmlFor="tr-show" className="sr-only">
              State
            </label>
            <select id="tr-show" value={show ?? ''} onChange={(e) => onFilter({ show: (e.target.value || null) as BatchShow | null })} className={`${FIELD} lg:w-52`}>
              <option value="">Any state</option>
              {BATCH_SHOWS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <label htmlFor="tr-hmo" className="sr-only">
              HMO
            </label>
            <select id="tr-hmo" value={hmo ?? ''} onChange={(e) => onFilter({ hmo: e.target.value || null })} className={`${FIELD} lg:w-56`}>
              <option value="">Every HMO</option>
              {hmos.map((h) => (
                <option key={h._id} value={h._id}>
                  {h.name}
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
            <button type="button" onClick={onClear} className={`rounded px-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">The transmittals didn’t load ({error}).</p>
          <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.refresh} />
            Try again
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {loaded && !loading ? `${total} transmittals${narrowed ? ' match' : ''}.` : ''}
      </p>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={loading}>
        <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
          <span>Transmittal</span>
          <span>Sent</span>
          <span className="text-right">Claimed</span>
          <span className="text-right">Still owed</span>
          <span>State</span>
          <span className="sr-only">Open</span>
        </div>

        {!loaded ? (
          error ? null : (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: pageSize }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3.5 w-28 rounded bg-gray-100" />
                    <span className="block h-3 w-40 rounded bg-gray-50" />
                  </span>
                  <span className="hidden h-3.5 w-24 rounded bg-gray-50 lg:block" />
                  <span className="h-5 w-16 rounded bg-gray-100" />
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
              <Svg d={narrowed ? ICONS.search : ICONS.inbox} className="h-5 w-5" />
            </div>
            {narrowed ? (
              <>
                <p className="font-semibold text-gray-900">No transmittals match</p>
                <p className="mt-1 text-sm text-gray-500">Search by transmittal number, patient or invoice number, or loosen a filter.</p>
                <button type="button" onClick={onClear} className={`mt-5 ${SECONDARY}`}>
                  Clear search and filters
                </button>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-900">No transmittals yet</p>
                <p className="mt-1 text-sm text-gray-500">Put claims in one from the To send tab, then print it and mark it sent.</p>
              </>
            )}
          </div>
        ) : (
          <ul key={rowsUrl ?? listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {rows.map((b, i) => (
              <TransmittalRow key={b._id} b={b} index={i} money={money} onOpen={() => onOpen(b._id)} />
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
              {narrowed ? ' matching transmittals' : ' transmittals'}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <PageSizeSelect id="tr-page-size" value={pageSize} onChange={onPageSize} disabled={loading} />
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onPage(Math.max(1, page - 1))}
                    disabled={page === 1 || loading}
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
                        onClick={() => onPage(n)}
                        disabled={loading}
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
                    onClick={() => onPage(Math.min(pages, page + 1))}
                    disabled={page === pages || loading}
                    aria-label="Next page"
                    className={`rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  >
                    <Svg d={ICONS.chevR} />
                  </button>
                </div>
              )}
            </div>
          </nav>
        )}
      </div>
    </>
  );
}

/** One transmittal: who, when it was sent and when payment is due, what was claimed and what is still owed. */
function TransmittalRow({ b, index, money, onOpen }: { b: BatchRow; index: number; money: Money; onOpen: () => void }) {
  const waiting = b.status === 'submitted' || b.status === 'partial';
  const due = waiting && b.dueAt ? dueWords(b.dueAt) : null;
  const sentAgo = b.submittedAt ? daysAgo(b.submittedAt) : null;
  return (
    <li
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button')) return;
        onOpen();
      }}
      className={`motion-row-in group flex cursor-pointer flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="min-w-0">
        <Link href={`/hmo-claims/${b._id}`} className={`rounded font-mono font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
          {b.batchNumber}
        </Link>
        <span className="mt-0.5 block truncate text-sm text-gray-700">{b.hmoName}</span>
      </span>

      <span className="text-sm">
        {b.submittedAt ? (
          <>
            <span className="block font-mono tabular-nums text-gray-900">{shortDate(b.submittedAt)}</span>
            {due ? (
              <span className={`block text-xs ${due.late ? 'font-medium text-red-700' : 'text-gray-500'}`}>{due.text}</span>
            ) : (
              sentAgo !== null && <span className="block text-xs text-gray-500">{agoWords(sentAgo, 'sent')}</span>
            )}
          </>
        ) : (
          <>
            <span className="block text-gray-700">Not sent yet</span>
            <span className="block text-xs text-gray-500">made {shortDate(b.createdAt)}</span>
          </>
        )}
      </span>

      <span className="text-sm lg:text-right">
        <span className="block font-mono tabular-nums text-gray-900">
          <span className="font-sans text-gray-500 lg:hidden">Claimed </span>
          {money(b.totalClaimed)}
        </span>
        <span className="block text-xs text-gray-500">
          {plural(b.claims, 'claim')}
          {b.refused > 0 && <span className="font-medium text-amber-800"> · {b.refused} refused</span>}
        </span>
      </span>

      <span className="text-sm lg:text-right">
        {waiting || b.status === 'draft' ? (
          <>
            <span className={`block font-mono tabular-nums ${b.outstanding > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              {money(b.status === 'draft' ? b.totalClaimed : b.outstanding)}
              <span className="font-sans font-normal text-gray-500 lg:hidden"> still owed</span>
            </span>
            {b.received > 0 && <span className="block text-xs text-gray-500"><span className="font-mono">{money(b.received)}</span> received</span>}
          </>
        ) : (
          <span className="block text-gray-500">
            <span className="font-mono">{money(b.received)}</span> received
          </span>
        )}
      </span>

      <span>
        <BatchBadge status={b.status} />
      </span>

      <span className="hidden text-gray-400 transition-colors group-hover:text-gray-700 lg:inline" aria-hidden="true">
        <Svg d={ICONS.chevR} />
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// HMOs
// ---------------------------------------------------------------------------

function Payers({
  rows,
  error,
  onRetry,
  figures,
  money,
  onTransmittals,
  onSaved,
}: {
  rows: HmoRow[] | null;
  error: string | null;
  onRetry: () => void;
  figures: HmoInsights['byHmo'];
  money: Money;
  onTransmittals: (id: string) => void;
  onSaved: (message: string) => void;
}) {
  const [editing, setEditing] = useState<{ row: HmoRow | null } | null>(null);
  const byId = new Map(figures.map((f) => [f.hmoId, f]));
  const sorted = rows ? [...rows].sort((a, b) => Number(!a.active) - Number(!b.active)) : null;

  if (error && !rows) {
    return (
      <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">The HMO list didn’t load ({error}).</p>
        <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
          <Svg d={ICONS.refresh} />
          Try again
        </button>
      </div>
    );
  }
  if (!sorted) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />;

  return (
    <>
      <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="payers-h">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
          <div>
            <h2 id="payers-h" className="text-base font-bold tracking-tight text-gray-900">
              HMOs, insurers and company accounts
            </h2>
            <p className="text-sm text-gray-500">The payers bills can be charged to, and how each one pays.</p>
          </div>
          <button type="button" onClick={() => setEditing({ row: null })} className={SECONDARY}>
            <Svg d={ICONS.plus} />
            Add an HMO
          </button>
        </div>
        {sorted.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-gray-900">No HMOs on the list yet</p>
            <p className="mt-1 text-sm text-gray-500">Add the HMOs the clinic is accredited with, so bills can be charged to them and claims sent.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sorted.map((h, i) => {
              const f = byId.get(h._id);
              const slow = f?.daysToPay != null && f.daysToPay > h.paymentTermsDays;
              return (
                <li
                  key={h._id}
                  className="motion-row-in grid gap-3 px-5 py-3.5 text-sm lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6"
                  style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setEditing({ row: h })} className={`rounded text-left font-semibold hover:text-brand-teal-deep hover:underline ${h.active ? 'text-gray-900' : 'text-gray-600'} ${FOCUS_RING}`}>
                        {h.name}
                      </button>
                      {h.code && <span className="font-mono text-xs text-gray-500">{h.code}</span>}
                      {!h.active && <span className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-300">No longer accepted</span>}
                    </p>
                    <p className="mt-0.5 text-gray-500">
                      {HMO_KIND_LABEL[h.kind]} · pays within <span className="font-mono">{h.paymentTermsDays}</span> days · withholds <span className="font-mono">{h.withholdingServicesRate}%</span> on services,{' '}
                      <span className="font-mono">{h.withholdingProfessionalRate}%</span> on doctors’ fees{h.requiresLoa ? ' · LOA on every claim' : ''}
                    </p>
                    {(h.contactName || h.email || h.phone) && <p className="mt-0.5 truncate text-gray-600">{[h.contactName, h.email, h.phone].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <dl className="grid grid-cols-3 gap-3 lg:text-right">
                    <div>
                      <dt className="text-xs text-gray-500">Owes</dt>
                      <dd className={`font-mono tabular-nums ${f?.owed ? 'text-gray-900' : 'text-gray-400'}`}>{money(f?.owed ?? 0)}</dd>
                      {f && f.pastDue > 0 && <dd className="text-xs font-medium text-red-700"><span className="font-mono">{money(f.pastDue)}</span> past due</dd>}
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Not sent</dt>
                      <dd className={`font-mono tabular-nums ${f?.toSend ? 'text-gray-900' : 'text-gray-400'}`}>{f?.toSend ?? 0}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Pays in</dt>
                      <dd className={`font-mono tabular-nums ${slow ? 'font-medium text-amber-800' : f?.daysToPay != null ? 'text-gray-900' : 'text-gray-400'}`}>
                        {f?.daysToPay != null ? `~${f.daysToPay} days` : '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex items-center gap-1 lg:justify-end">
                    <button type="button" onClick={() => onTransmittals(h._id)} className={`rounded-md px-2.5 py-1.5 text-sm font-semibold text-brand-teal-dark hover:bg-brand-teal-light/60 hover:text-brand-teal-deep ${FOCUS_RING}`}>
                      Transmittals
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ row: h })}
                      aria-label={`Change ${h.name}`}
                      title="Change"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.pencil} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {editing && (
        <HmoDialog
          row={editing.row}
          rows={rows ?? []}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            onSaved(editing.row ? m : `${m} Pick it in a bill’s insurer section to charge it.`);
          }}
        />
      )}
    </>
  );
}
