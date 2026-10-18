'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import AccountDialog from './AccountDialog';
import { ROLE_LABEL, StateBadge, initials, inviteLine, lastSeen, useSend } from './users-shared';
import { IDLE_DAYS } from '@/lib/admin-overview.shared';
import {
  USER_SHOWS,
  USER_SHOW_LABEL,
  USER_SORTS,
  USER_SORT_LABEL,
  USER_STATES,
  userState,
  type UserInsights,
  type UserRow,
  type UserShow,
  type UserSort,
} from '@/lib/users';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const PAGE_SIZE = 25;
const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_6rem_minmax(0,1fr)_auto] lg:items-center lg:gap-4';
const ICONS = {
  ...ICON,
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  dots: 'M12 5h.01M12 12h.01M12 19h.01',
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

export default function UsersPageClient({
  meId,
  emailReady,
  initialShow,
  initialRole,
}: {
  meId: string;
  emailReady: boolean;
  initialShow: UserShow | '';
  initialRole: string;
}) {
  const send = useSend('The invite couldn’t be sent');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [show, setShow] = useState<UserShow | ''>(initialShow);
  const [role, setRole] = useState(initialRole);
  const [sort, setSort] = useState<UserSort>(initialShow === 'idle' ? 'last-sign-in' : 'name');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<UserRow | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState<string | null>(null);

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
  if (show) params.set('show', show);
  if (role) params.set('role', role);
  const listUrl = `/api/users?${params}`;
  const list = useKeyedFetch<UserRow[]>(listUrl);
  const insights = useKeyedFetch<UserInsights>('/api/users/insights');

  const rows = list.value ?? [];
  const loaded = list.value !== null;
  const refreshing = list.loading && loaded;
  const pagination = (list.raw?.pagination as Pagination | undefined) ?? null;
  const total = pagination?.total ?? rows.length;
  const pages = pagination?.pages ?? 1;
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);
  const roles = insights.value?.roles ?? [];

  const reset = () => setPage(1);
  const pickShow = (s: UserShow | '') => {
    setShow(s);
    if (s === 'idle') setSort('last-sign-in');
    reset();
  };
  const roleName = roles.find((r) => r._id === role)?.displayName ?? 'Selected role';
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (show) chips.push({ key: 'show', label: USER_SHOW_LABEL[show], clear: () => (setShow(''), reset()) });
  if (role) chips.push({ key: 'role', label: roleName, clear: () => (setRole(''), reset()) });
  const narrowed = chips.length > 0 || debounced.trim() !== '';
  const clearAll = () => {
    setShow('');
    setRole('');
    setSearch('');
    setDebounced('');
    setPage(1);
  };

  const refresh = () => {
    list.reload();
    insights.reload();
  };
  const done = (text: string) => {
    setOpen(null);
    setNotice({ tone: 'ok', text });
    refresh();
  };
  const resendInvite = async (u: UserRow) => {
    setSending(u._id);
    const result = await send(`/api/users/${u._id}/invite`, 'POST');
    setSending(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Sent ${u.name} a new invite to ${u.email}. The link works for 72 hours.` });
      refresh();
    } else setNotice({ tone: 'error', text: result.error });
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Users</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Everyone who can sign in to the clinic: their role, whether they’ve set up their account, and when they last used it.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/staff" className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}>
            Add staff
          </Link>
          <Link href="/doctors/new" className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            Add a doctor
          </Link>
        </div>
      </header>

      <p className="-mt-3 text-sm text-gray-500">
        Accounts are made when you add someone as staff or as a doctor; they get an emailed invite to set their own password.
      </p>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`motion-panel-in flex items-start justify-between gap-4 rounded-lg border p-4 ${
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          <p className="flex items-start gap-2 text-sm font-medium">
            <Svg d={notice.tone === 'error' ? ICONS.alert : ICONS.check} className="mt-0.5 h-4 w-4 shrink-0" />
            {notice.text}
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 hover:bg-black/5 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}

      {insights.value ? (
        <Insights
          data={insights.value}
          show={show}
          role={role}
          onShow={(s) => pickShow(show === s ? '' : s)}
          onRole={(r) => {
            setRole((cur) => (cur === r ? '' : r));
            reset();
          }}
        />
      ) : insights.error ? (
        <p className="rounded-lg border border-gray-200 bg-white px-5 py-3 text-sm text-gray-500">
          The account figures didn’t load ({insights.error}).{' '}
          <button type="button" onClick={insights.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            Try again
          </button>
        </p>
      ) : (
        <div className="h-[232px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
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
            <label htmlFor="users-search" className="sr-only">
              Search accounts
            </label>
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Svg d={ICONS.search} />
            </span>
            <input
              id="users-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              autoComplete="off"
              className={`${FIELD} pl-9`}
            />
          </form>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
            <label htmlFor="users-show" className="sr-only">
              Show
            </label>
            <select id="users-show" value={show} onChange={(e) => pickShow(e.target.value as UserShow | '')} className={`${FIELD} lg:w-60`}>
              <option value="">Every account</option>
              {USER_SHOWS.map((s) => (
                <option key={s} value={s}>
                  {USER_SHOW_LABEL[s]}
                </option>
              ))}
            </select>
            <label htmlFor="users-role" className="sr-only">
              Role
            </label>
            <select
              id="users-role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                reset();
              }}
              className={`${FIELD} lg:w-44`}
            >
              <option value="">Any role</option>
              {roles.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="users-sort" className="sr-only">
              Sort
            </label>
            <select
              id="users-sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as UserSort);
                reset();
              }}
              className={`${FIELD} lg:w-56`}
            >
              {USER_SORTS.map((s) => (
                <option key={s} value={s}>
                  {USER_SORT_LABEL[s]}
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
          <p className="text-sm font-medium text-red-800">The accounts didn’t load ({list.error}).</p>
          <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.refresh} />
            Try again
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {loaded && !list.loading ? `${total} accounts${narrowed ? ' match' : ''}.` : ''}
      </p>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
        <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
          <span>Person</span>
          <span>Role</span>
          <span>Account</span>
          <span>Two-step</span>
          <span>Last signed in</span>
          <span className="sr-only">Actions</span>
        </div>

        {!loaded ? (
          list.error ? null : (
            <ul aria-hidden="true" className="divide-y divide-gray-100 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="h-9 w-9 rounded-md bg-gray-100" />
                  <span className="flex-1 space-y-1.5">
                    <span className="block h-3.5 w-44 rounded bg-gray-100" />
                    <span className="block h-3 w-56 rounded bg-gray-50" />
                  </span>
                  <span className="hidden h-3 w-24 rounded bg-gray-100 lg:block" />
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <Empty narrowed={narrowed} onClear={clearAll} />
        ) : (
          <ul key={listUrl} className={`divide-y divide-gray-100 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
            {rows.map((u, i) => (
              <UserRowItem
                key={u._id}
                u={u}
                index={i}
                isYou={u._id === meId}
                canEmail={emailReady}
                sending={sending === u._id}
                now={list.receivedAt}
                onOpen={() => setOpen(u)}
                onResend={() => resendInvite(u)}
              />
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
              {narrowed ? ' matching accounts' : ' accounts'}, {USER_SORT_LABEL[sort].toLowerCase()}
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

      {open && (
        <AccountDialog user={open} roles={roles} isYou={open._id === meId} emailReady={emailReady} onClose={() => setOpen(null)} onDone={done} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function UserRowItem({
  u,
  index,
  isYou,
  canEmail,
  sending,
  now,
  onOpen,
  onResend,
}: {
  u: UserRow;
  index: number;
  /** When the list arrived; "not used in 60 days" is measured from it. */
  now: number;
  isYou: boolean;
  canEmail: boolean;
  sending: boolean;
  onOpen: () => void;
  onResend: () => void;
}) {
  const state = userState(u);
  const invited = state === 'invited' || state === 'invite-expired';
  const idle = state === 'active' && new Date(u.lastLogin ?? u.createdAt).getTime() < now - IDLE_DAYS * 24 * 60 * 60 * 1000;
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onOpen();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID} ${state === 'inactive' ? 'text-gray-500' : ''}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-700">
          {initials(u.name)}
        </span>
        <span className="min-w-0">
          <button type="button" onClick={onOpen} className={`block max-w-full truncate rounded text-left font-semibold ${state === 'inactive' ? 'text-gray-600' : 'text-gray-900'} hover:text-brand-teal-deep ${FOCUS_RING}`}>
            {u.name}
            {isYou && <span className="ml-1.5 text-xs font-semibold text-gray-500">You</span>}
          </button>
          <span className="block truncate text-sm text-gray-500">{u.email}</span>
        </span>
      </span>

      <span className="text-sm text-gray-700 lg:truncate">
        <span className="text-gray-500 lg:hidden">Role: </span>
        {ROLE_LABEL(u.role)}
      </span>

      <span className="min-w-0 text-sm">
        <StateBadge state={state} />
        {invited && <span className={`mt-0.5 block truncate text-xs ${state === 'invite-expired' ? 'text-amber-800' : 'text-gray-500'}`}>{inviteLine(u, state)}</span>}
      </span>

      <span className="text-sm">
        <span className="text-gray-500 lg:hidden">Two-step: </span>
        {invited ? <span className="text-gray-400">—</span> : u.totpEnabled ? <span className="text-gray-700">On</span> : <span className="text-amber-800">Off</span>}
      </span>

      <span className="text-sm">
        <span className="text-gray-500 lg:hidden">Last signed in: </span>
        <span className={`font-mono tabular-nums ${idle ? 'text-amber-800' : 'text-gray-700'}`}>{invited ? 'Not yet' : lastSeen(u.lastLogin)}</span>
        {idle && <span className="block text-xs text-amber-800">Not used in {IDLE_DAYS} days</span>}
      </span>

      <span className="flex items-center gap-1 lg:justify-end">
        {invited && !isYou && canEmail && (
          <button
            type="button"
            onClick={onResend}
            disabled={sending}
            aria-label={`Send ${u.name} a new invite`}
            className={`rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            {sending ? 'Sending…' : 'Send invite again'}
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Manage ${u.name}’s account`}
          className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.dots} />
        </button>
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Insights: who has access, in which role, and how well it is protected
// ---------------------------------------------------------------------------

function Insights({
  data,
  show,
  role,
  onShow,
  onRole,
}: {
  data: UserInsights;
  show: UserShow | '';
  role: string;
  onShow: (s: UserShow) => void;
  onRole: (id: string) => void;
}) {
  const canSignIn = data.byState.active;
  const ranked = [...data.roles].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...ranked.map((r) => r.count));
  const { on, total, adminsWithout } = data.twoStep;
  const share = total ? on / total : 0;

  const stateButton = (s: UserShow, tone?: string) => {
    const n = s === 'idle' ? data.idle : s === 'no-two-step' ? total - on : data.byState[s as keyof typeof data.byState] ?? 0;
    const active = show === s;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onShow(s)}
        className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
          active ? 'bg-brand-teal-light/60 font-semibold' : ''
        }`}
      >
        <span className={n > 0 && tone ? tone : 'text-gray-700'}>{USER_SHOW_LABEL[s]}</span>
        <span className="shrink-0 font-mono tabular-nums text-gray-900">{n.toLocaleString('en-US')}</span>
      </button>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="users-access-h">
          <h2 id="users-access-h" className="text-sm text-gray-600">
            Can sign in now
          </h2>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${canSignIn ? 'text-gray-900' : 'text-gray-500'}`}>{canSignIn.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-mono">{data.signedInWeek.toLocaleString('en-US')}</span> signed in during the last 7 days
          </p>
          <div className="mt-3 space-y-0.5" role="group" aria-label="Filter by account state">
            {USER_STATES.filter((s) => s !== 'active').map((s) => (
              <div key={s}>{stateButton(s, s === 'invite-expired' ? 'text-amber-800' : undefined)}</div>
            ))}
          </div>
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="users-roles-h">
          <h2 id="users-roles-h" className="text-sm text-gray-600">
            Accounts by role
          </h2>
          {ranked.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No accounts yet.</p>
          ) : (
            <ul className="mt-2 space-y-1" role="group" aria-label="Filter by role">
              {ranked.map((r, i) => {
                const active = role === r._id;
                return (
                  <li key={r._id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onRole(r._id)}
                      aria-label={`${r.displayName}: ${r.count} ${r.count === 1 ? 'account' : 'accounts'}${active ? ', filtering' : ''}`}
                      className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${active ? 'bg-brand-teal-light/60' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className={`min-w-0 truncate ${active ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{r.displayName}</span>
                        <span className="shrink-0 font-mono tabular-nums text-gray-900">{r.count.toLocaleString('en-US')}</span>
                      </span>
                      <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                        <span
                          className="motion-bar-grow block h-full rounded-r"
                          style={{ width: `${(r.count / max) * 100}%`, background: active ? '#0A7F7E' : SERIES.teal, opacity: role && !active ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-gray-500">Suspended accounts count; closed ones don’t.</p>
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="users-security-h">
          <h2 id="users-security-h" className="text-sm text-gray-600">
            Two-step verification
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">
            {on.toLocaleString('en-US')}
            <span className="text-lg text-gray-500"> of {total.toLocaleString('en-US')}</span>
          </p>
          <div
            role="meter"
            aria-label="Accounts using two-step verification"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={on}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
          >
            <div className="motion-bar-grow h-full rounded-full" style={{ width: `${share * 100}%`, background: SERIES.teal }} />
          </div>
          <p className={`mt-2 text-sm ${adminsWithout ? 'font-medium text-amber-800' : 'text-gray-500'}`}>
            {adminsWithout
              ? `${adminsWithout} ${adminsWithout === 1 ? 'administrator signs' : 'administrators sign'} in without it`
              : 'Every administrator uses it'}
          </p>
          <div className="mt-3 space-y-0.5" role="group" aria-label="Filter by sign-in safety">
            {stateButton('no-two-step', 'text-amber-800')}
            {stateButton('idle', 'text-amber-800')}
          </div>
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, onClear }: { narrowed: boolean; onClear: () => void }) {
  let body: ReactNode;
  if (narrowed) {
    body = (
      <>
        <p className="font-semibold text-gray-900">No accounts match</p>
        <p className="mt-1 text-sm text-gray-500">Check the spelling, or loosen a filter.</p>
        <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Clear search and filters
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="font-semibold text-gray-900">No accounts yet</p>
        <p className="mt-1 text-sm text-gray-500">Add someone as staff or as a doctor; they get an invite to set their password.</p>
      </>
    );
  }
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.users} className="h-5 w-5" />
      </div>
      {body}
    </div>
  );
}

