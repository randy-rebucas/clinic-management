'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, ICON, Svg } from './appointments/shared';
import { SERIES } from './dashboards/charts';
import EnrolDialog from './memberships/EnrolDialog';
import { StateBadge, TierMark, ValidUntil, memberName, pts, type MembershipRow } from './memberships/shared';
import {
  MEMBERSHIP_TIERS,
  RENEWAL_DAYS,
  SORTS,
  SORT_LABEL,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  TIER,
  membershipState,
  type MembershipSort,
  type MembershipStatusFilter,
  type MembershipTier,
} from '@/lib/memberships';
import type { MembershipPagePermissions } from '@/lib/memberships-page';

interface Insights {
  inDate: number;
  byTier: Partial<Record<MembershipTier, number>>;
  byStatus: Partial<Record<'active' | 'expired' | 'suspended' | 'inactive', number>>;
  due: { count: number; next: { _id: string; name: string; tier: MembershipTier; expiryDate: string }[] };
  lapsedRecently: number;
  joinedRecently: number;
  points: { held: number; windowDays: number; earned: number; used: number; corrections: number; top: { _id: string; name: string; points: number; tier: MembershipTier }[] };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 25;
const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_minmax(0,1.1fr)_7rem] lg:items-center lg:gap-4';

const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  ticket: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
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

const isStatus = (v: string | null): v is MembershipStatusFilter => !!v && (STATUS_FILTERS as readonly string[]).includes(v);
const isTier = (v: string | null): v is MembershipTier => !!v && (MEMBERSHIP_TIERS as readonly string[]).includes(v);

export default function MembershipsPageClient({
  permissions,
  initialStatus,
  initialTier,
}: {
  permissions: MembershipPagePermissions;
  initialStatus: string | null;
  initialTier: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tier, setTier] = useState<MembershipTier | ''>(isTier(initialTier) ? initialTier : '');
  const [status, setStatus] = useState<MembershipStatusFilter | ''>(isStatus(initialStatus) ? initialStatus : '');
  const [sort, setSort] = useState<MembershipSort>(initialStatus === 'due' ? 'expiry' : 'newest');
  const [page, setPage] = useState(1);
  const [enrolling, setEnrolling] = useState(false);

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
  if (tier) params.set('tier', tier);
  if (status) params.set('status', status);
  const listUrl = `/api/memberships?${params}`;
  const list = useKeyedFetch<MembershipRow[]>(listUrl);
  const insights = useKeyedFetch<Insights>('/api/memberships/insights');

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  const reset = () => setPage(1);
  const pickStatus = (s: MembershipStatusFilter | '') => {
    setStatus(s);
    if (s === 'due' || s === 'expired') setSort('expiry');
    reset();
  };
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (tier) chips.push({ key: 'tier', label: `${TIER[tier].label} tier`, clear: () => (setTier(''), reset()) });
  if (status) chips.push({ key: 'status', label: STATUS_FILTER_LABEL[status], clear: () => (setStatus(''), reset()) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setTier('');
    setStatus('');
    setSearch('');
    setDebounced('');
    setPage(1);
  };
  const empty = insights.value && insights.value.inDate === 0 && Object.values(insights.value.byStatus).every((n) => !n);

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Memberships</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Who is in the clinic’s loyalty programme, the discount their tier gives, their points, and renewals coming due.</p>
          </div>
          {permissions.canEnrol && (
            <button
              type="button"
              onClick={() => setEnrolling(true)}
              className={`inline-flex w-fit items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ICONS.plus} />
              Enrol a patient
            </button>
          )}
        </header>

        {insights.value ? (
          !empty && (
            <MembershipInsights
              data={insights.value}
              tier={tier}
              status={status}
              onTier={(t) => {
                setTier((cur) => (cur === t ? '' : t));
                if (!status) setStatus('active');
                reset();
              }}
              onStatus={(s) => pickStatus(status === s ? '' : s)}
            />
          )
        ) : insights.error ? (
          <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
            The membership figures didn&apos;t load ({insights.error}).{' '}
            <button type="button" onClick={insights.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : (
          <div className="h-[244px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
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
              <label htmlFor="mem-search" className="sr-only">
                Search members
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="mem-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, patient code or membership number"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
              <label htmlFor="mem-tier" className="sr-only">
                Tier
              </label>
              <select
                id="mem-tier"
                value={tier}
                onChange={(e) => {
                  setTier(e.target.value as MembershipTier | '');
                  reset();
                }}
                className={`${FIELD} lg:w-40`}
              >
                <option value="">Any tier</option>
                {MEMBERSHIP_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER[t].label}
                  </option>
                ))}
              </select>
              <label htmlFor="mem-status" className="sr-only">
                Status
              </label>
              <select id="mem-status" value={status} onChange={(e) => pickStatus(e.target.value as MembershipStatusFilter | '')} className={`${FIELD} lg:w-56`}>
                <option value="">Any status</option>
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_FILTER_LABEL[s]}
                  </option>
                ))}
              </select>
              <label htmlFor="mem-sort" className="sr-only">
                Sort
              </label>
              <select
                id="mem-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as MembershipSort);
                  reset();
                }}
                className={`${FIELD} lg:w-44`}
              >
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
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
            <p className="text-sm font-medium text-red-800">The members didn&apos;t load ({list.error}).</p>
            <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICONS.refresh} />
              Try again
            </button>
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {loaded && !list.loading ? `${total} members${narrowed ? ' match' : ''}.` : ''}
        </p>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
          <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
            <span>Member</span>
            <span>Tier</span>
            <span className="text-right">Points</span>
            <span>Membership</span>
            <span className="sr-only">Status</span>
          </div>

          {!loaded ? (
            list.error ? null : (
              <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="flex-1 space-y-1.5">
                      <span className="block h-3.5 w-48 rounded bg-gray-100" />
                      <span className="block h-3 w-28 rounded bg-gray-50" />
                    </span>
                    <span className="hidden h-3 w-24 rounded bg-gray-100 lg:block" />
                    <span className="h-3 w-16 rounded bg-gray-100" />
                  </li>
                ))}
              </ul>
            )
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed} canEnrol={permissions.canEnrol} onClear={clearAll} onEnrol={() => setEnrolling(true)} />
          ) : (
            <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {rows.map((m, i) => (
                <MemberRow key={m._id} m={m} index={i} onOpen={() => router.push(`/memberships/${m._id}`)} />
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
                {narrowed ? ' matching members' : ' members'}, {SORT_LABEL[sort].toLowerCase()}
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

      {enrolling && <EnrolDialog canChooseTier={permissions.canManage} onClose={() => setEnrolling(false)} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function MemberRow({ m, index, onOpen }: { m: MembershipRow; index: number; onOpen: () => void }) {
  const state = membershipState(m);
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
        <Link href={`/memberships/${m._id}`} className={`block truncate rounded font-semibold text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
          {memberName(m)}
        </Link>
        <span className="mt-0.5 block truncate font-mono text-xs text-gray-500">
          {m.membershipNumber}
          {m.patient?.patientCode && ` · ${m.patient.patientCode}`}
        </span>
      </span>

      <span className="text-sm">
        <TierMark tier={m.tier} showDiscount />
      </span>

      <span className="text-sm lg:text-right">
        <span className="font-mono tabular-nums text-gray-900">{pts(m.points)}</span>
        <span className="text-gray-500"> pts</span>
      </span>

      <span className="min-w-0 text-sm">
        <ValidUntil iso={m.expiryDate} className="block truncate" />
        <span className="block truncate text-xs text-gray-500">
          Member since <span className="font-mono">{new Date(m.joinDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        </span>
      </span>

      <span className="flex items-center gap-2 lg:justify-end">
        {state !== 'active' && <StateBadge state={state} />}
        <Svg d={ICONS.chevR} className="hidden h-4 w-4 text-gray-400 transition-colors group-hover:text-gray-700 lg:block" />
      </span>
    </li>
  );
}

/**
 * Three questions whoever runs the programme asks: who is a member now (by tier, which filters
 * the list), whose membership needs renewing, and how many points the clinic owes its members.
 * Figures are clinic-wide and never shrink with the filters.
 */
function MembershipInsights({
  data,
  tier,
  status,
  onTier,
  onStatus,
}: {
  data: Insights;
  tier: MembershipTier | '';
  status: MembershipStatusFilter | '';
  onTier: (t: MembershipTier) => void;
  onStatus: (s: MembershipStatusFilter) => void;
}) {
  const max = Math.max(1, ...MEMBERSHIP_TIERS.map((t) => data.byTier[t] ?? 0));
  const held = data.byStatus.suspended ?? 0;
  const inactive = data.byStatus.inactive ?? 0;
  const p = data.points;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="mem-tiers-h">
          <h2 id="mem-tiers-h" className="text-sm text-gray-600">
            Members in date
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${data.inDate ? 'text-gray-900' : 'text-gray-500'}`}>{data.inDate.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {data.joinedRecently > 0 ? (
              <>
                <span className="font-mono">{data.joinedRecently}</span> joined in the last 30 days
              </>
            ) : (
              'Nobody joined in the last 30 days'
            )}
            {(held > 0 || inactive > 0) && (
              <>
                {'; '}
                {[held && `${held} suspended`, inactive && `${inactive} inactive`].filter(Boolean).join(', ')}
              </>
            )}
          </p>
          <ul className="mt-3 space-y-1" role="group" aria-label="Filter by tier">
            {MEMBERSHIP_TIERS.map((t, i) => {
              const n = data.byTier[t] ?? 0;
              const on = tier === t;
              return (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onTier(t)}
                    aria-label={`${TIER[t].label}, ${TIER[t].discount}% off: ${n} ${n === 1 ? 'member' : 'members'}${on ? ', filtering' : ''}`}
                    className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <TierMark tier={t} showDiscount className={on ? 'font-semibold' : ''} />
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n.toLocaleString('en-US')}</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                      <span
                        className="motion-bar-grow block h-full rounded-r"
                        style={{ width: `${(n / max) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: tier && !on ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="mem-due-h">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="mem-due-h" className="text-sm text-gray-600">
              Renewals due in {RENEWAL_DAYS} days
            </h2>
            {data.due.count > 0 && (
              <button type="button" aria-pressed={status === 'due'} onClick={() => onStatus('due')} className={`rounded text-xs font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                {status === 'due' ? 'Show all' : 'List them'}
              </button>
            )}
          </div>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${data.due.count ? 'text-gray-900' : 'text-gray-500'}`}>{data.due.count.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            {data.lapsedRecently > 0 ? (
              <button type="button" aria-pressed={status === 'expired'} onClick={() => onStatus('expired')} className={`rounded text-left font-medium text-red-700 hover:text-red-800 hover:underline ${FOCUS_RING}`}>
                <span className="font-mono">{data.lapsedRecently}</span> ended in the last {RENEWAL_DAYS} days without renewing
              </button>
            ) : data.due.count === 0 ? (
              'No membership ends in the next 30 days.'
            ) : (
              'Patients are reminded by text and email as the date nears.'
            )}
          </p>
          {data.due.next.length > 0 && (
            <ul className="mt-3 space-y-1">
              {data.due.next.map((d) => (
                <li key={d._id}>
                  <Link href={`/memberships/${d._id}`} className={`-mx-2 block rounded px-2 py-1 text-sm hover:bg-gray-50 ${FOCUS_RING}`}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-gray-700">{d.name}</span>
                      <ValidUntil iso={d.expiryDate} className="shrink-0 text-xs" />
                    </span>
                    <span className="block text-xs text-gray-500">{TIER[d.tier]?.label ?? d.tier}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="mem-points-h">
          <h2 id="mem-points-h" className="text-sm text-gray-600">
            Points members hold
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${p.held ? 'text-gray-900' : 'text-gray-500'}`}>{pts(p.held)}</p>
          <p className="mt-1 text-sm text-gray-500">
            {p.earned || p.used ? (
              <>
                <span className="font-mono">+{pts(p.earned)}</span> added, <span className="font-mono">−{pts(p.used)}</span> used in the last {p.windowDays} days
              </>
            ) : (
              `No points added or used in the last ${p.windowDays} days.`
            )}
          </p>
          {p.top.length > 0 && (
            <>
              <h3 className="mt-3 text-xs font-medium text-gray-500">Highest balances</h3>
              <ul className="mt-1 space-y-1">
                {p.top.map((t) => (
                  <li key={t._id}>
                    <Link href={`/memberships/${t._id}`} className={`-mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50 ${FOCUS_RING}`}>
                      <span className="min-w-0 truncate text-gray-700">{t.name}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gray-900">{pts(t.points)} pts</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, canEnrol, onClear, onEnrol }: { narrowed: boolean; canEnrol: boolean; onClear: () => void; onEnrol: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No members match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, search by membership number, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No members yet</p>
        <p className="mt-1 text-sm text-gray-500">
          Enrol a patient to give them their tier’s discount on every bill: Bronze <span className="font-mono">{TIER.bronze.discount}%</span> up to Platinum{' '}
          <span className="font-mono">{TIER.platinum.discount}%</span>.
        </p>
        {canEnrol && (
          <button type="button" onClick={onEnrol} className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            <Svg d={ICONS.plus} />
            Enrol a patient
          </button>
        )}
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.ticket} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}
