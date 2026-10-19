'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { Modal } from '../ui/Modal';
import FilterBar from '../ui/FilterBar';
import PageSizeSelect from '../ui/PageSizeSelect';
import { TableTwin } from '../dashboards/charts';
import { FIELD, FOCUS_RING, Svg } from '../appointments/shared';
import { FieldError, Label } from '../visits/form/parts';
import { useMoney, shortDate } from '../invoices/shared';
import { useSend } from '../admin/users-shared';
import { CHECKBOX, ICONS, LINK, PRIMARY, SECONDARY, ageTone, agoWords, daysAgo, plural } from '../hmo/shared';
import {
  CASE_RATE_KIND_LABEL,
  DEADLINES,
  PHILHEALTH_STATUS,
  WAITS,
  deadlineOf,
  waitOf,
  type CaseRateKind,
  type CaseRateRow,
  type ClaimRow,
  type DeadlineKey,
  type PhilhealthInsights,
  type SettledStatus,
  type WaitKey,
} from '@/lib/philhealth';
import { DEFAULT_PAGE_SIZE } from '@/lib/page-size';

export type PhilhealthTab = 'file' | 'filed' | 'done' | 'rates';
const TABS: { key: PhilhealthTab; label: string }[] = [
  { key: 'file', label: 'To file' },
  { key: 'filed', label: 'Filed' },
  { key: 'done', label: 'Paid or denied' },
  { key: 'rates', label: 'Case rates' },
];
type Action = { kind: 'file' | 'pay' | 'return' | 'deny'; claim: ClaimRow };
type Money = (v: number) => string;
interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const DOWNLOAD = 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4';
const BAN = 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636';
const UNDO = 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const deadlineLabel = (k: DeadlineKey) => DEADLINES.find((d) => d.key === k)!.label;
const waitLabel = (k: WaitKey) => WAITS.find((w) => w.key === k)!.label;

/** "12 days left", "Due today", "3 days past the deadline". */
function leftWords(daysLeft: number) {
  if (daysLeft < 0) return `${plural(-daysLeft, 'day')} past the deadline`;
  if (daysLeft === 0) return 'Due today';
  return `${plural(daysLeft, 'day')} left`;
}
const leftTone = (daysLeft: number) => (daysLeft < 0 ? 'font-medium text-red-700' : daysLeft <= 7 ? 'font-medium text-amber-800' : 'text-gray-500');

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
 * PhilHealth claims: each claim from bill to payment, against its filing deadline, and the case
 * rates bills are priced from. The figures count every claim; the deadline and waiting bars
 * filter the lists beneath them.
 */
export default function PhilhealthClient({ initialTab, configured, filingDays }: { initialTab: PhilhealthTab; configured: boolean; filingDays: number }) {
  const router = useRouter();
  const { money } = useMoney();
  const [tab, setTab] = useState<PhilhealthTab>(initialTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);

  // Filters
  const [deadline, setDeadline] = useState<DeadlineKey | null>(null);
  const [returnedOnly, setReturnedOnly] = useState(false);
  const [wait, setWait] = useState<WaitKey | null>(null);
  const [result, setResult] = useState<SettledStatus | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
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

  const insights = useKeyedFetch<PhilhealthInsights>('/api/philhealth/insights');
  const open = useKeyedFetch<{ filingDays: number; claims: ClaimRow[]; limited: boolean }>(tab === 'file' || tab === 'filed' ? '/api/philhealth/claims' : null);
  const params = new URLSearchParams({ view: 'done', page: String(page), limit: String(pageSize) });
  if (result) params.set('result', result);
  if (debounced.trim()) params.set('search', debounced.trim());
  const doneUrl = `/api/philhealth/claims?${params}`;
  const done = useKeyedFetch<ClaimRow[]>(tab === 'done' ? doneUrl : null);
  const rates = useKeyedFetch<CaseRateRow[]>(tab === 'rates' ? '/api/philhealth/case-rates' : null);

  const refresh = () => {
    insights.reload();
    open.reload();
    done.reload();
  };

  const choose = (t: PhilhealthTab) => {
    setTab(t);
    router.replace(t === 'file' ? '/philhealth' : `/philhealth?tab=${t}`, { scroll: false });
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    choose(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  const claims = open.value?.claims ?? null;
  const toFile = useMemo(() => (claims ?? []).filter((c) => c.status === 'draft' || c.status === 'returned').sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)), [claims]);
  const filed = useMemo(() => (claims ?? []).filter((c) => c.status === 'filed').sort((a, b) => Date.parse(a.filedAt ?? a.servedOn) - Date.parse(b.filedAt ?? b.servedOn)), [claims]);
  const shownToFile = toFile.filter((c) => (!deadline || deadlineOf(c.daysLeft ?? 0) === deadline) && (!returnedOnly || c.status === 'returned'));
  const shownFiled = filed.filter((c) => !wait || waitOf(daysAgo(c.filedAt ?? c.servedOn)) === wait);
  const counts: Partial<Record<PhilhealthTab, number>> = insights.value
    ? { file: insights.value.toFile.count, filed: insights.value.filed.count }
    : { file: claims ? toFile.length : undefined, filed: claims ? filed.length : undefined };

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">PhilHealth</h1>
            <p className="mt-1 text-sm sm:text-base text-gray-600">
              Claims on the clinic’s bills: file each one in eClaims within <span className="font-mono">{filingDays}</span> days, then record what PhilHealth pays.
            </p>
          </div>
          <a href="/api/philhealth/claims/export" download className={`w-fit ${SECONDARY}`} title="Includes members’ PhilHealth numbers; the download is recorded in the audit log">
            <Svg d={DOWNLOAD} />
            Download CSV
          </a>
        </header>

        {!configured && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              PhilHealth billing is off for this clinic, so new bills have no PhilHealth section. Turn it on and enter the accreditation number in{' '}
              <Link href="/admin/settings#philhealth" className="font-semibold underline underline-offset-2">
                clinic settings
              </Link>
              .
            </p>
          </div>
        )}

        {insights.value ? (
          <ClaimInsights
            data={insights.value}
            money={money}
            deadline={deadline}
            returnedOnly={returnedOnly}
            wait={wait}
            result={result}
            onDeadline={(k) => {
              setDeadline((cur) => (cur === k ? null : k));
              choose('file');
            }}
            onReturned={() => {
              setReturnedOnly((v) => !v);
              choose('file');
            }}
            onWait={(k) => {
              setWait((cur) => (cur === k ? null : k));
              choose('filed');
            }}
            onResult={(r) => {
              setResult((cur) => (cur === r ? null : r));
              setPage(1);
              choose('done');
            }}
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

        <div role="tablist" aria-label="PhilHealth views" className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t, i) => {
            const on = t.key === tab;
            const n = counts[t.key];
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                type="button"
                id={`ph-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`ph-panel-${t.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => choose(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                {t.label}
                {n ? <span className="ml-1.5 font-mono text-xs font-medium text-gray-500">{n.toLocaleString('en-US')}</span> : null}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`ph-panel-${tab}`} aria-labelledby={`ph-tab-${tab}`} className="flex flex-col gap-4">
          {(tab === 'file' || tab === 'filed') &&
            (open.error && !claims ? (
              <LoadError what="The claims" error={open.error} onRetry={open.reload} />
            ) : !claims ? (
              <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
            ) : (
              <>
                {open.value?.limited && (
                  <p className="text-sm text-gray-600">
                    Showing the <span className="font-mono">2,000</span> oldest claims still in hand; the figures above count them all.
                  </p>
                )}
                <Chips
                  chips={[
                    ...(tab === 'file' && deadline ? [{ key: 'deadline', label: deadlineLabel(deadline), clear: () => setDeadline(null) }] : []),
                    ...(tab === 'file' && returnedOnly ? [{ key: 'returned', label: 'Returned for correction', clear: () => setReturnedOnly(false) }] : []),
                    ...(tab === 'filed' && wait ? [{ key: 'wait', label: `Filed ${waitLabel(wait).toLowerCase()} ago`, clear: () => setWait(null) }] : []),
                  ]}
                  onClear={() => {
                    setDeadline(null);
                    setReturnedOnly(false);
                    setWait(null);
                  }}
                />
                <OpenList
                  tab={tab}
                  rows={tab === 'file' ? shownToFile : shownFiled}
                  narrowed={tab === 'file' ? Boolean(deadline || returnedOnly) : Boolean(wait)}
                  dimmed={open.loading}
                  money={money}
                  onAct={setAction}
                />
              </>
            ))}

          {tab === 'done' && (
            <SettledList
              rows={done.value}
              rowsUrl={done.valueUrl}
              loading={done.loading}
              error={done.error}
              onRetry={done.reload}
              pagination={(done.raw?.pagination as Pagination | undefined) ?? null}
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
              result={result}
              onResult={(r) => {
                setResult(r);
                setPage(1);
              }}
              money={money}
            />
          )}

          {tab === 'rates' && (
            <CaseRates
              rows={rates.value}
              error={rates.error}
              onRetry={rates.reload}
              onSaved={(m) => {
                setNotice(m);
                rates.reload();
              }}
            />
          )}
        </div>

        {action && (
          <ActionDialog
            action={action}
            onClose={() => setAction(null)}
            onDone={(m) => {
              setAction(null);
              setNotice(m);
              refresh();
            }}
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

/**
 * Three questions: what must still be filed, and how close are the deadlines; what has PhilHealth
 * not paid, and for how long; what came back in the last 90 days. The bars filter the lists.
 */
function ClaimInsights({
  data,
  money,
  deadline,
  returnedOnly,
  wait,
  result,
  onDeadline,
  onReturned,
  onWait,
  onResult,
}: {
  data: PhilhealthInsights;
  money: Money;
  deadline: DeadlineKey | null;
  returnedOnly: boolean;
  wait: WaitKey | null;
  result: SettledStatus | null;
  onDeadline: (k: DeadlineKey) => void;
  onReturned: () => void;
  onWait: (k: WaitKey) => void;
  onResult: (r: SettledStatus) => void;
}) {
  const { toFile, filed, settled90: s } = data;
  const late = toFile.deadlines.find((d) => d.key === 'late')!;
  const dMax = Math.max(1, ...toFile.deadlines.map((d) => d.count));
  const wMax = Math.max(1, ...filed.waits.map((w) => w.count));

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        <section className="flex flex-col border-r border-b border-gray-200" aria-labelledby="ph-file-h">
          <div className="p-5">
            <h2 id="ph-file-h" className="text-sm text-gray-600">
              To file in eClaims
            </h2>
            <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${toFile.count ? 'text-gray-900' : 'text-gray-500'}`}>{money(toFile.amount)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {toFile.count === 0 ? (
                'Every claim has been filed.'
              ) : (
                <>
                  on <span className="font-mono">{toFile.count.toLocaleString('en-US')}</span> {toFile.count === 1 ? 'claim' : 'claims'}
                  {late.count > 0 && (
                    <span className="font-medium text-red-700">
                      {' '}
                      · <span className="font-mono">{late.count}</span> past the deadline
                    </span>
                  )}
                </>
              )}
            </p>
            {toFile.count > 0 && (
              <ul className="mt-4 space-y-1" role="group" aria-label="Filter claims to file by their deadline">
                {toFile.deadlines.map((d, i) => (
                  <li key={d.key}>
                    <FilterBar
                      index={i}
                      label={deadlineLabel(d.key)}
                      tone={d.key === 'late' && d.count > 0 ? 'text-red-700' : undefined}
                      value={d.count.toLocaleString('en-US')}
                      share={d.count / dMax}
                      on={deadline === d.key}
                      dim={deadline !== null}
                      disabled={d.count === 0}
                      ariaLabel={`${deadlineLabel(d.key)}: ${plural(d.count, 'claim')}, ${money(d.amount)}${deadline === d.key ? ', filtering' : ''}`}
                      onClick={() => onDeadline(d.key)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {toFile.returned > 0 && (
              <button
                type="button"
                aria-pressed={returnedOnly}
                onClick={onReturned}
                className={`-mx-2 mt-3 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 ${FOCUS_RING} ${returnedOnly ? 'bg-brand-teal-light/60 font-semibold' : ''}`}
              >
                <span className="flex items-center gap-1.5 font-medium text-amber-800">
                  <Svg d={UNDO} className="h-3.5 w-3.5 shrink-0" />
                  Returned for correction
                </span>
                <span className="font-mono tabular-nums text-amber-800">{toFile.returned}</span>
              </button>
            )}
          </div>
          <div className="mt-auto">
            <TableTwin
              caption="Claims still to file, by how close their deadline is"
              head={['Deadline', 'Claims', 'Amount']}
              rows={toFile.deadlines.map((d) => [deadlineLabel(d.key), d.count, money(d.amount)])}
            />
          </div>
        </section>

        <section className="flex flex-col border-r border-b border-gray-200" aria-labelledby="ph-wait-h">
          <div className="p-5">
            <h2 id="ph-wait-h" className="text-sm text-gray-600">
              Filed, not paid yet
            </h2>
            <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${filed.count ? 'text-gray-900' : 'text-gray-500'}`}>{money(filed.amount)}</p>
            <p className="mt-1 text-sm text-gray-500">
              {filed.count === 0 ? (
                'Nothing is waiting on PhilHealth.'
              ) : (
                <>
                  on <span className="font-mono">{filed.count.toLocaleString('en-US')}</span> {filed.count === 1 ? 'claim' : 'claims'}
                </>
              )}
            </p>
            {filed.count > 0 && (
              <ul className="mt-4 space-y-1" role="group" aria-label="Filter filed claims by how long they have waited">
                {filed.waits.map((w, i) => (
                  <li key={w.key}>
                    <FilterBar
                      index={i}
                      label={`Filed ${waitLabel(w.key).toLowerCase()} ago`}
                      value={w.count.toLocaleString('en-US')}
                      share={w.count / wMax}
                      on={wait === w.key}
                      dim={wait !== null}
                      disabled={w.count === 0}
                      ariaLabel={`Filed ${waitLabel(w.key).toLowerCase()} ago: ${plural(w.count, 'claim')}, ${money(w.amount)}${wait === w.key ? ', filtering' : ''}`}
                      onClick={() => onWait(w.key)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-auto">
            <TableTwin
              caption="Filed claims not paid yet, by days since filing"
              head={['Filed', 'Claims', 'Amount']}
              rows={filed.waits.map((w) => [`${waitLabel(w.key)} ago`, w.count, money(w.amount)])}
            />
          </div>
        </section>

        <section className="flex flex-col border-r border-b border-gray-200 p-5" aria-labelledby="ph-paid-h">
          <h2 id="ph-paid-h" className="text-sm text-gray-600">
            Paid in the last 90 days
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${s.paid ? 'text-gray-900' : 'text-gray-500'}`}>{money(s.paidAmount)}</p>
          <p className="mt-1 text-sm text-gray-500">
            {s.paid === 0 ? (
              'No payment recorded in 90 days.'
            ) : (
              <>
                on <span className="font-mono">{s.paid}</span> {s.paid === 1 ? 'claim' : 'claims'}
                {s.withheld > 0 && (
                  <>
                    , <span className="font-mono">{money(s.withheld)}</span> of it withheld tax
                  </>
                )}
              </>
            )}
          </p>
          <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100 text-sm">
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-gray-700">From filing to payment</dt>
              <dd className="font-mono tabular-nums text-gray-900">{s.daysToPay === null ? '—' : `about ${s.daysToPay} days`}</dd>
            </div>
            {s.partPaid > 0 && (
              <div className="py-1">
                <button
                  type="button"
                  aria-pressed={result === 'part_paid'}
                  onClick={() => onResult('part_paid')}
                  className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded px-2 py-1 text-left transition-colors hover:bg-gray-50 ${FOCUS_RING} ${result === 'part_paid' ? 'bg-brand-teal-light/60 font-semibold' : ''}`}
                >
                  <span className="font-medium text-amber-800">Paid less than claimed</span>
                  <span className="font-mono tabular-nums text-amber-800">
                    {s.partPaid} · {money(s.shortAmount)} short
                  </span>
                </button>
              </div>
            )}
            <div className="py-1">
              <button
                type="button"
                aria-pressed={result === 'denied'}
                disabled={s.denied === 0}
                onClick={() => onResult('denied')}
                className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded px-2 py-1 text-left transition-colors enabled:hover:bg-gray-50 disabled:cursor-default ${FOCUS_RING} ${result === 'denied' ? 'bg-brand-teal-light/60 font-semibold' : ''}`}
              >
                <span className={s.denied ? 'font-medium text-amber-800' : 'text-gray-500'}>{s.denied ? 'Denied, back with the patients' : 'None denied'}</span>
                {s.denied > 0 && (
                  <span className="font-mono tabular-nums text-amber-800">
                    {s.denied} · {money(s.deniedAmount)}
                  </span>
                )}
              </button>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

function Chips({ chips, onClear }: { chips: { key: string; label: string; clear: () => void }[]; onClear: () => void }) {
  if (!chips.length) return null;
  return (
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
  );
}

function LoadError({ what, error, onRetry }: { what: string; error: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">
        {what} didn’t load ({error}).
      </p>
      <button type="button" onClick={onRetry} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
        <Svg d={ICONS.refresh} />
        Try again
      </button>
    </div>
  );
}

function Badge({ status }: { status: ClaimRow['status'] }) {
  const st = PHILHEALTH_STATUS[status];
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>;
}

/** Who and what the claim is for: the patient, the bill, the PIN, the case rate and the visit. */
function ClaimWho({ c }: { c: ClaimRow }) {
  return (
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
        <Link href={`/invoices/${c.invoiceId}`} className={`truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
          {c.patientName}
        </Link>
        {c.status === 'returned' && <Badge status="returned" />}
      </span>
      <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">
        {c.invoiceNumber} · PIN {c.pin}
        {c.relationship === 'dependent' && <span className="font-sans"> (dependent)</span>}
      </span>
      <span className="mt-0.5 block truncate text-xs text-gray-600">
        <span className="font-mono">{c.caseRateCode}</span> {c.caseRateDescription} · seen {shortDate(c.servedOn)}
      </span>
    </span>
  );
}

const OPEN_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_8rem_auto] lg:items-start lg:gap-4';

function OpenList({ tab, rows, narrowed, dimmed, money, onAct }: { tab: 'file' | 'filed'; rows: ClaimRow[]; narrowed: boolean; dimmed: boolean; money: Money; onAct: (a: Action) => void }) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
        <p className="font-semibold text-gray-900">{narrowed ? 'No claims match' : tab === 'file' ? 'Nothing to file' : 'Nothing waiting on PhilHealth'}</p>
        <p className="mt-1 text-sm text-gray-500">
          {narrowed
            ? 'Clear the filter to see every claim.'
            : tab === 'file'
              ? 'A claim appears here when a bill is made with a PhilHealth section.'
              : 'Claims you mark filed wait here until PhilHealth pays, returns or denies them.'}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className={`hidden ${OPEN_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
        <span>Claim</span>
        <span>{tab === 'file' ? 'File by' : 'Filed'}</span>
        <span className="text-right">PhilHealth pays</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${dimmed ? 'opacity-60' : ''}`}>
        {rows.map((c, i) => {
          const sinceFiled = c.filedAt ? daysAgo(c.filedAt) : null;
          return (
            <li key={c.invoiceId} className={`motion-row-in group flex flex-col gap-2 px-4 py-3 text-sm ${OPEN_GRID}`} style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
              <span className="min-w-0">
                <ClaimWho c={c} />
                {c.status === 'returned' && c.note && (
                  <span className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-800">
                    <Svg d={ICONS.alert} className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                      PhilHealth asked: “{c.note}”{c.returnedAt && <span className="font-normal"> · {shortDate(c.returnedAt)}</span>}
                    </span>
                  </span>
                )}
              </span>

              <span>
                {tab === 'file' && c.fileBy && c.daysLeft !== null ? (
                  <>
                    <span className="block font-mono tabular-nums text-gray-900">{shortDate(c.fileBy)}</span>
                    <span className={`block text-xs ${leftTone(c.daysLeft)}`}>{leftWords(c.daysLeft)}</span>
                    {c.returnedAt && <span className="block text-xs text-gray-500">60 days from PhilHealth’s notice</span>}
                  </>
                ) : (
                  <>
                    <span className="block font-mono tabular-nums text-gray-900">{c.filedAt ? shortDate(c.filedAt) : '—'}</span>
                    {sinceFiled !== null && <span className={`block text-xs ${ageTone(sinceFiled)}`}>{agoWords(sinceFiled, 'filed')}</span>}
                    {c.claimNumber && <span className="block truncate font-mono text-xs text-gray-500">{c.claimNumber}</span>}
                  </>
                )}
              </span>

              <span className="lg:text-right">
                <span className="block font-mono font-semibold tabular-nums text-gray-900">{money(c.amount)}</span>
                {c.pfAmount > 0 && (
                  <span className="block text-xs text-gray-500">
                    <span className="font-mono">{money(c.hciAmount)}</span> clinic · <span className="font-mono">{money(c.pfAmount)}</span> doctor
                  </span>
                )}
              </span>

              <span className="flex items-center gap-1 lg:justify-end">
                <a
                  href={`/api/philhealth/claims/${c.invoiceId}/worksheet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Claim worksheet for ${c.patientName} (opens in a new tab)`}
                  title="Claim worksheet"
                  className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}
                >
                  <Svg d={ICONS.print} />
                </a>
                {tab === 'file' ? (
                  <>
                    <button type="button" onClick={() => onAct({ kind: 'file', claim: c })} className={`${SECONDARY} whitespace-nowrap px-3 py-1.5`}>
                      {c.status === 'returned' ? 'Mark filed again' : 'Mark filed'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAct({ kind: 'deny', claim: c })}
                      aria-label={`Don’t claim from PhilHealth for ${c.patientName}`}
                      title="Don’t claim it"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`}
                    >
                      <Svg d={BAN} />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onAct({ kind: 'pay', claim: c })} className={`${SECONDARY} whitespace-nowrap px-3 py-1.5`}>
                      Record payment
                    </button>
                    <button
                      type="button"
                      onClick={() => onAct({ kind: 'return', claim: c })}
                      aria-label={`PhilHealth returned the claim for ${c.patientName}`}
                      title="Returned for correction"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-amber-50 hover:text-amber-800 ${FOCUS_RING}`}
                    >
                      <Svg d={UNDO} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAct({ kind: 'deny', claim: c })}
                      aria-label={`PhilHealth denied the claim for ${c.patientName}`}
                      title="Denied"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 ${FOCUS_RING}`}
                    >
                      <Svg d={BAN} />
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const DONE_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] lg:items-start lg:gap-4';

function SettledList({
  rows,
  rowsUrl,
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
  result,
  onResult,
  money,
}: {
  rows: ClaimRow[] | null;
  rowsUrl: string | null;
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
  result: SettledStatus | null;
  onResult: (r: SettledStatus | null) => void;
  money: Money;
}) {
  const loaded = rows !== null;
  const total = pagination?.total ?? rows?.length ?? 0;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  const narrowed = Boolean(result || search.trim());
  const SEG = [
    { key: null, label: 'All' },
    { key: 'paid' as const, label: 'Paid' },
    { key: 'part_paid' as const, label: 'Part paid' },
    { key: 'denied' as const, label: 'Denied' },
  ];

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitSearch();
          }}
        >
          <label htmlFor="ph-search" className="sr-only">
            Search paid and denied claims
          </label>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Svg d={ICONS.search} />
          </span>
          <input
            id="ph-search"
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by patient, bill, claim number, case rate or PIN"
            autoComplete="off"
            className={`${FIELD} pl-9`}
          />
        </form>
        <div role="group" aria-label="Show" className="flex w-fit gap-1 rounded-md border border-gray-200 bg-white p-1">
          {SEG.map((s) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={result === s.key}
              onClick={() => onResult(s.key)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${FOCUS_RING} ${result === s.key ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <LoadError what="The paid and denied claims" error={error} onRetry={onRetry} />}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden" aria-busy={loading}>
        <div className={`hidden ${DONE_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
          <span>Claim</span>
          <span>Answer</span>
          <span className="text-right">Paid</span>
          <span className="sr-only">Worksheet</span>
        </div>
        {!loaded ? (
          error ? null : (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: pageSize }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3.5 w-40 rounded bg-gray-100" />
                    <span className="block h-3 w-56 rounded bg-gray-50" />
                  </span>
                  <span className="h-4 w-20 rounded bg-gray-100" />
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-gray-900">{narrowed ? 'No claims match' : 'Nothing paid or denied yet'}</p>
            <p className="mt-1 text-sm text-gray-500">{narrowed ? 'Search by patient, bill or claim number, or show all.' : 'Claims land here once PhilHealth pays or denies them.'}</p>
          </div>
        ) : (
          <ul key={rowsUrl ?? ''} className={`divide-y divide-gray-100 transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`}>
            {rows.map((c, i) => {
              const paid = (c.paidAmount ?? 0) + (c.withheldAmount ?? 0);
              const settledPaid = c.status === 'paid' || c.status === 'part_paid';
              const short = settledPaid ? Math.max(0, c.amount - paid) : c.amount;
              const took = c.filedAt && c.paidAt ? Math.max(0, Math.round((Date.parse(c.paidAt) - Date.parse(c.filedAt)) / 86_400_000)) : null;
              return (
                <li key={c.invoiceId} className={`motion-row-in flex flex-col gap-2 px-4 py-3 text-sm ${DONE_GRID}`} style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
                  <ClaimWho c={c} />
                  <span>
                    <Badge status={c.status} />
                    {settledPaid ? (
                      <span className="mt-1 block text-xs text-gray-500">
                        {c.paidAt && <span className="font-mono">{shortDate(c.paidAt)}</span>}
                        {took !== null && <> · {plural(took, 'day')} after filing</>}
                      </span>
                    ) : (
                      c.note && <span className="mt-1 block text-xs text-gray-600">“{c.note}”</span>
                    )}
                  </span>
                  <span className="lg:text-right">
                    {settledPaid ? (
                      <>
                        <span className="block font-mono font-semibold tabular-nums text-gray-900">{money(paid)}</span>
                        {(c.withheldAmount ?? 0) > 0 && (
                          <span className="block text-xs text-gray-500">
                            <span className="font-mono">{money(c.withheldAmount ?? 0)}</span> of it tax
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="block font-mono tabular-nums text-gray-500">{money(0)}</span>
                    )}
                    {short > 0.004 && (
                      <span className="block text-xs font-medium text-amber-800">
                        <span className="font-mono">{money(short)}</span> back with the patient
                      </span>
                    )}
                  </span>
                  <span className="flex lg:justify-end">
                    <a
                      href={`/api/philhealth/claims/${c.invoiceId}/worksheet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Claim worksheet for ${c.patientName} (opens in a new tab)`}
                      title="Claim worksheet"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.print} />
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {loaded && total > 0 && (
          <nav aria-label="Pagination" className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-mono text-gray-900">
                {firstRow.toLocaleString('en-US')}–{lastRow.toLocaleString('en-US')}
              </span>{' '}
              of <span className="font-mono text-gray-900">{total.toLocaleString('en-US')}</span>
              {narrowed ? ' matching claims' : ' claims'}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <PageSizeSelect id="ph-page-size" value={pageSize} onChange={onPageSize} disabled={loading} />
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

// ---------------------------------------------------------------------------
// Answer dialog
// ---------------------------------------------------------------------------

function ActionDialog({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: (message: string) => void }) {
  const ids = useId();
  const { money } = useMoney();
  const send = useSend('The claim couldn’t be updated');
  const c = action.claim;
  const filedAlready = c.status === 'filed';
  const [claimNumber, setClaimNumber] = useState(c.claimNumber ?? '');
  const [date, setDate] = useState(todayKey);
  const [amount, setAmount] = useState(String(c.amount));
  const [withheld, setWithheld] = useState('0');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    action.kind === 'file'
      ? c.status === 'returned'
        ? 'Mark the corrected claim filed'
        : 'Mark the claim filed'
      : action.kind === 'pay'
        ? 'Record PhilHealth’s payment'
        : action.kind === 'return'
          ? 'PhilHealth returned the claim'
          : filedAlready
            ? 'PhilHealth denied the claim'
            : 'Don’t claim from PhilHealth';

  const a = amount.trim() === '' ? NaN : Number(amount);
  const w = withheld.trim() === '' ? 0 : Number(withheld);
  const rest = Number.isFinite(a) && Number.isFinite(w) ? Math.max(0, Math.round((c.amount - a - w) * 100) / 100) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let body: Record<string, unknown>;
    if (action.kind === 'file') body = { action: 'file', claimNumber: claimNumber.trim() || undefined, filedAt: date };
    else if (action.kind === 'pay') {
      if (!Number.isFinite(a) || a < 0 || !Number.isFinite(w) || w < 0) return setError('Enter amounts of 0 or more.');
      if (a + w > c.amount + 0.005) return setError(`That’s more than the claim (${money(c.amount)}).`);
      body = { action: 'pay', amount: Math.round(a * 100) / 100, withheld: Math.round(w * 100) / 100, date, reference: reference.trim() || undefined };
    } else if (action.kind === 'return') {
      if (!note.trim()) return setError('Say what PhilHealth asked to be corrected.');
      body = { action: 'return', note: note.trim(), returnedAt: date };
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
          ? rest > 0
            ? `Recorded as part paid on ${c.invoiceNumber}: PhilHealth paid ${money(c.amount - rest)}, and ${money(rest)} stays on the bill for the patient.`
            : `Recorded PhilHealth’s payment on ${c.invoiceNumber}.`
          : action.kind === 'return'
            ? `Returned. Send PhilHealth what it asked for within 60 days of the notice.`
            : `${filedAlready ? 'Denied' : 'Not claimed'}. The patient owes ${money(c.amount)} more on ${c.invoiceNumber}.`
    );
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-lg" labelledBy={`${ids}-t`} closeOnBackdrop={false}>
      <form onSubmit={submit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-t`} className="text-lg font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {c.patientName} · <span className="font-mono">{c.invoiceNumber}</span> · <span className="font-mono">{money(c.amount)}</span>
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          {action.kind === 'file' && (
            <>
              <Field id={`${ids}-n`} label="Claim series number" optional>
                <input id={`${ids}-n`} value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} maxLength={200} autoComplete="off" className={`${FIELD} font-mono`} />
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
                  <input id={`${ids}-r`} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" className={`${FIELD} font-mono`} />
                </Field>
              </div>
              <p className="text-sm text-gray-600">
                Posted to the bill as a PhilHealth payment, and the tax as creditable withholding.
                {rest > 0 && (
                  <span className="font-medium text-amber-800">
                    {' '}
                    The other <span className="font-mono">{money(rest)}</span> stays on the bill for the patient to pay.
                  </span>
                )}
              </p>
            </>
          )}
          {action.kind === 'return' && (
            <Field id={`${ids}-d`} label="Notice received on">
              <input id={`${ids}-d`} type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className={`${FIELD} font-mono`} />
            </Field>
          )}
          {(action.kind === 'return' || action.kind === 'deny') && (
            <Field id={`${ids}-note`} label={action.kind === 'return' ? 'What PhilHealth asked to correct' : filedAlready ? 'Reason given' : 'Why'} optional={action.kind === 'deny'}>
              <textarea id={`${ids}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={FIELD} />
            </Field>
          )}
          {action.kind === 'return' && (
            <p className="text-sm text-gray-600">
              PhilHealth allows <span className="font-mono">60</span> calendar days from receiving the notice to send what it asked for. Correct the bill, then mark it filed again.
            </p>
          )}
          {action.kind === 'deny' && (
            <p className="text-sm font-medium text-amber-800">
              The <span className="font-mono">{money(c.amount)}</span> PhilHealth was to pay stays on the bill for the patient. This can’t be undone.
            </p>
          )}
          {error && <FieldError id={`${ids}-err`}>{error}</FieldError>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className={action.kind === 'deny' ? `inline-flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 ${FOCUS_RING}` : PRIMARY}
          >
            <Svg d={ICONS.check} />
            {busy ? 'Saving…' : action.kind === 'file' ? 'Mark filed' : action.kind === 'pay' ? 'Post to the bill' : action.kind === 'return' ? 'Mark returned' : filedAlready ? 'Mark denied' : 'Don’t claim it'}
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

// ---------------------------------------------------------------------------
// Case rates
// ---------------------------------------------------------------------------

function CaseRates({ rows, error, onRetry, onSaved }: { rows: CaseRateRow[] | null; error: string | null; onRetry: () => void; onSaved: (m: string) => void }) {
  const { money } = useMoney();
  const [editing, setEditing] = useState<{ row: CaseRateRow | null } | null>(null);
  const [q, setQ] = useState('');
  if (error && !rows) return <LoadError what="The case rates" error={error} onRetry={onRetry} />;
  if (!rows) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />;
  const needle = q.trim().toLowerCase();
  const shown = [...rows]
    .filter((r) => !needle || r.code.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle))
    .sort((a, b) => Number(!a.active) - Number(!b.active));

  return (
    <section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="rates-h">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="rates-h" className="text-base font-bold tracking-tight text-gray-900">
            Case rates <span className="ml-1 font-mono text-sm font-medium text-gray-500">{rows.length}</span>
          </h2>
          <p className="text-sm text-gray-500">From PhilHealth’s circulars, for the cases the clinic bills. A change applies to bills made from then on.</p>
        </div>
        <button type="button" onClick={() => setEditing({ row: null })} className={`w-fit ${SECONDARY}`}>
          <Svg d={ICONS.plus} />
          Add a case rate
        </button>
      </div>
      {rows.length > 8 && (
        <div className="border-b border-gray-100 px-5 py-3">
          <label htmlFor="rate-search" className="sr-only">
            Find a case rate
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Svg d={ICONS.search} />
            </span>
            <input id="rate-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by code or case" autoComplete="off" className={`${FIELD} pl-9`} />
          </div>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="font-semibold text-gray-900">No case rates yet</p>
          <p className="mt-1 text-sm text-gray-500">Add the case rates the clinic bills, with their facility and professional-fee shares, so bills can carry a PhilHealth claim.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">No case rate matches “{q}”.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-gray-500">
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Code
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Case
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Case rate
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Clinic share
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">
                  Doctor’s share
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => (
                <tr key={r._id} className={r.active ? 'text-gray-900' : 'text-gray-600'}>
                  <th scope="row" className="px-5 py-2.5 text-left align-top">
                    <button type="button" onClick={() => setEditing({ row: r })} className={`rounded font-mono font-semibold hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {r.code}
                    </button>
                  </th>
                  <td className="px-3 py-2.5 align-top">
                    {r.description}
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {CASE_RATE_KIND_LABEL[r.kind]}
                      {!r.active && <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-gray-600 ring-1 ring-inset ring-gray-300">Retired</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-mono tabular-nums">{money(r.amount)}</td>
                  <td className="px-3 py-2.5 text-right align-top font-mono tabular-nums">{r.hciShare ? money(r.hciShare) : '—'}</td>
                  <td className="px-5 py-2.5 text-right align-top font-mono tabular-nums">{r.pfShare ? money(r.pfShare) : '—'}</td>
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
  const { money } = useMoney();
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
  const split = n(f.hciShare) + n(f.pfShare);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.code.trim() || !f.description.trim()) return setError('Enter the code and what the case is.');
    if (![n(f.amount), n(f.hciShare), n(f.pfShare)].every((v) => Number.isFinite(v) && v >= 0) || f.amount.trim() === '') return setError('Amounts are 0 or more.');
    if (split > n(f.amount) + 0.005) return setError('The two shares add up to more than the case rate.');
    setBusy(true);
    setError(null);
    const body = { code: f.code.trim(), kind: f.kind, description: f.description.trim(), amount: n(f.amount), hciShare: n(f.hciShare), pfShare: n(f.pfShare), active: f.active };
    const r = await send(row ? `/api/philhealth/case-rates/${row._id}` : '/api/philhealth/case-rates', row ? 'PUT' : 'POST', body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(row ? `Saved ${body.code}. Bills already made keep the rate they were priced at.` : `Added ${body.code}. It can be picked on a bill’s PhilHealth section.`);
  };

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-lg" labelledBy={`${ids}-t`} closeOnBackdrop={false}>
      <form onSubmit={save} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-t`} className="text-lg font-bold tracking-tight text-gray-900">
            {row ? <span className="font-mono">{row.code}</span> : 'Add a case rate'}
          </h2>
          {row && <p className="mt-0.5 text-sm text-gray-600">A change applies to bills made from now on.</p>}
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <Field id={`${ids}-c`} label="Code">
              <input id={`${ids}-c`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} maxLength={30} placeholder="e.g. A09.0" autoComplete="off" className={`${FIELD} font-mono uppercase`} />
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
            <input id={`${ids}-d`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} autoComplete="off" className={FIELD} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id={`${ids}-a`} label="Case rate">
              <input id={`${ids}-a`} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${FIELD} text-right font-mono tabular-nums`} />
            </Field>
            <Field id={`${ids}-h`} label="Clinic share" optional>
              <input id={`${ids}-h`} inputMode="decimal" value={f.hciShare} onChange={(e) => setF({ ...f, hciShare: e.target.value })} className={`${FIELD} text-right font-mono tabular-nums`} />
            </Field>
            <Field id={`${ids}-p`} label="Doctor’s share" optional>
              <input id={`${ids}-p`} inputMode="decimal" value={f.pfShare} onChange={(e) => setF({ ...f, pfShare: e.target.value })} className={`${FIELD} text-right font-mono tabular-nums`} />
            </Field>
          </div>
          <p className="text-sm text-gray-600">
            {split > 0 && Number.isFinite(split) ? (
              <>
                PhilHealth pays up to <span className="font-mono">{money(n(f.hciShare))}</span> of the clinic’s charges and up to{' '}
                <span className="font-mono">{money(n(f.pfShare))}</span> of the doctor’s fee.
              </>
            ) : (
              'Without a split, PhilHealth pays the case rate, up to the whole bill.'
            )}
          </p>
          {row && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className={`mt-0.5 ${CHECKBOX}`} />
              <span>
                <span className="font-medium text-gray-900">Still billed</span>
                <span className="block text-gray-500">Off, it’s retired: no longer offered on new bills.</span>
              </span>
            </label>
          )}
          {error && <FieldError id={`${ids}-err`}>{error}</FieldError>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={busy} className={SECONDARY}>
            Cancel
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className={PRIMARY}>
            <Svg d={ICONS.check} />
            {busy ? 'Saving…' : row ? 'Save changes' : 'Add the case rate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
