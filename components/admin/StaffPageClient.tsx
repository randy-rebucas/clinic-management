'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { AlertDialog } from '../ui/Modal';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { SERIES } from '../dashboards/charts';
import StaffDialog from './StaffDialog';
import { StateBadge, initials, inviteLine, lastSeen, useSend } from './users-shared';
import {
  STAFF_SHOWS,
  STAFF_SHOW_LABEL,
  STAFF_STATUS,
  STAFF_STATUSES,
  STAFF_TYPE,
  STAFF_TYPES,
  accountState,
  leftButCanSignIn,
  matchesShow,
  staffName,
  workLine,
  type StaffRow,
  type StaffShow,
  type StaffStatus,
  type StaffType,
} from '@/lib/staff';

const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_8.5rem_6.5rem_minmax(0,1.2fr)_auto] lg:items-center lg:gap-4';
const ICONS = {
  ...ICON,
  users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  plus: 'M12 5v14m7-7H5',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

/** Status: active = seen teal, on leave = pending amber, inactive = outside the hue set (outline). */
const STATUS_LOOK: Record<StaffStatus, { badge: string; fill: string | null }> = {
  active: { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', fill: SERIES.teal },
  'on-leave': { badge: 'bg-amber-50 text-amber-800 ring-amber-200', fill: '#D97706' },
  inactive: { badge: 'bg-gray-50 text-gray-600 ring-gray-300', fill: null },
};

const SORTS = { name: 'By name', newest: 'Newest first' } as const;
type Sort = keyof typeof SORTS;

/** Removable only when nobody ever used the account: a mistaken entry, nothing recorded under it. */
const removable = (r: StaffRow) => !r.account || (r.account.mustSetPassword && !r.account.lastLogin);

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function StaffPageClient({
  meId,
  emailReady,
  initialShow,
  initialType,
  initialStatus,
}: {
  meId: string;
  emailReady: boolean;
  initialShow: StaffShow | '';
  initialType: StaffType | '';
  initialStatus: StaffStatus | '';
}) {
  const send = useSend('That didn’t go through');
  const list = useKeyedFetch<StaffRow[]>('/api/staff');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<StaffType | ''>(initialType);
  const [status, setStatus] = useState<StaffStatus | ''>(initialStatus);
  const [show, setShow] = useState<StaffShow | ''>(initialShow);
  const [sort, setSort] = useState<Sort>('name');
  const [editing, setEditing] = useState<StaffRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const all = useMemo(() => list.value ?? [], [list.value]);
  const loaded = list.value !== null;
  const now = list.receivedAt;
  const truncated = list.raw?.truncated === true;

  const rows = useMemo(() => {
    const q = fold(search.trim());
    const digits = q.replace(/\D/g, '');
    const out = all.filter((r) => {
      if (type && r.staffType !== type) return false;
      if (status && r.status !== status) return false;
      if (show && !matchesShow(r, show, now)) return false;
      if (!q) return true;
      const hay = fold(`${r.firstName} ${r.lastName} ${r.email} ${r.employeeId ?? ''} ${r.department ?? ''}`);
      return hay.includes(q) || (digits.length >= 3 && r.phone.replace(/\D/g, '').includes(digits));
    });
    return out.sort((a, b) =>
      sort === 'newest'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
    );
  }, [all, search, type, status, show, sort, now]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (type) chips.push({ key: 'type', label: STAFF_TYPE[type].plural, clear: () => setType('') });
  if (status) chips.push({ key: 'status', label: STAFF_STATUS[status].label, clear: () => setStatus('') });
  if (show) chips.push({ key: 'show', label: STAFF_SHOW_LABEL[show], clear: () => setShow('') });
  const narrowed = chips.length > 0 || search.trim() !== '';
  const clearAll = () => {
    setType('');
    setStatus('');
    setShow('');
    setSearch('');
  };

  const saved = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
    list.reload();
  };

  const resendInvite = async (r: StaffRow) => {
    setBusy(r._id);
    const result = await send(`/api/users/${r.account!.userId}/invite`, 'POST');
    setBusy(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Sent ${staffName(r)} a new invite at ${r.email}. The link works for 72 hours; the old one no longer does.` });
      list.reload();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const remove = async () => {
    if (!removing) return;
    const r = removing;
    setBusy(r._id);
    const result = await send(`/api/staff/${r._id}?type=${r.staffType}`, 'DELETE');
    setBusy(null);
    setRemoving(null);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Removed ${staffName(r)} from the staff list.` });
      list.reload();
    } else setNotice({ tone: 'error', text: result.error });
  };

  const defaultType: StaffType = type || 'nurse';

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Staff</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Nurses, receptionists and accountants: their work details, and whether each one can sign in.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/doctors" className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}>
            Doctors
          </Link>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={`inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
          >
            <Svg d={ICONS.plus} />
            Add staff member
          </button>
        </div>
      </header>

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

      {loaded ? (
        all.length > 0 && (
          <Insights
            rows={all}
            now={now}
            type={type}
            status={status}
            show={show}
            onType={(t) => setType((cur) => (cur === t ? '' : t))}
            onStatus={(s) => setStatus((cur) => (cur === s ? '' : s))}
            onShow={(s) => setShow((cur) => (cur === s ? '' : s))}
          />
        )
      ) : list.error ? null : (
        <div className="h-[244px] animate-pulse rounded-lg border border-gray-200 bg-white" aria-hidden="true" />
      )}

      {/* Toolbar */}
      {(!loaded || all.length > 0) && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <form role="search" className="relative flex-1" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="staff-search" className="sr-only">
                Search staff
              </label>
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Svg d={ICONS.search} />
              </span>
              <input
                id="staff-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone or employee ID"
                autoComplete="off"
                className={`${FIELD} pl-9`}
              />
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:flex">
              <label htmlFor="staff-type" className="sr-only">
                Job
              </label>
              <select id="staff-type" value={type} onChange={(e) => setType(e.target.value as StaffType | '')} className={`${FIELD} lg:w-40`}>
                <option value="">Every job</option>
                {STAFF_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {STAFF_TYPE[t].plural}
                  </option>
                ))}
              </select>
              <label htmlFor="staff-status" className="sr-only">
                Status
              </label>
              <select id="staff-status" value={status} onChange={(e) => setStatus(e.target.value as StaffStatus | '')} className={`${FIELD} lg:w-36`}>
                <option value="">Any status</option>
                {STAFF_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STAFF_STATUS[s].label}
                  </option>
                ))}
              </select>
              <label htmlFor="staff-show" className="sr-only">
                Signing in
              </label>
              <select id="staff-show" value={show} onChange={(e) => setShow(e.target.value as StaffShow | '')} className={`${FIELD} lg:w-60`}>
                <option value="">Any sign-in</option>
                {STAFF_SHOWS.map((s) => (
                  <option key={s} value={s}>
                    {STAFF_SHOW_LABEL[s]}
                  </option>
                ))}
              </select>
              <label htmlFor="staff-sort" className="sr-only">
                Sort
              </label>
              <select id="staff-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${FIELD} lg:w-36`}>
                {(Object.keys(SORTS) as Sort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORTS[s]}
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
      )}

      {list.error && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            {loaded ? `The list couldn’t be refreshed (${list.error}); showing what loaded before.` : `The staff list didn’t load (${list.error}).`}
          </p>
          <button type="button" onClick={list.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.refresh} />
            Try again
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {loaded && !list.loading ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'}${narrowed ? ' match' : ''}.` : ''}
      </p>

      {(loaded || !list.error) && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-busy={list.loading}>
          {(!loaded || all.length > 0) && (
            <div className={`hidden ${ROW_GRID} border-b border-gray-200 bg-gray-50/60 px-4 py-2.5 text-sm font-medium text-gray-500`}>
              <span>Person</span>
              <span>Job</span>
              <span>Phone</span>
              <span>Status</span>
              <span>Signing in</span>
              <span className="sr-only">Actions</span>
            </div>
          )}

          {!loaded ? (
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
          ) : rows.length === 0 ? (
            <Empty narrowed={narrowed && all.length > 0} onClear={clearAll} onAdd={() => setEditing('new')} />
          ) : (
            <ul className={`divide-y divide-gray-100 transition-opacity duration-200 ${list.loading ? 'opacity-60' : ''}`}>
              {rows.map((r, i) => (
                <StaffRowItem
                  key={`${r.staffType}:${r._id}`}
                  r={r}
                  index={i}
                  now={now}
                  isYou={r.account?.userId === meId}
                  canEmail={emailReady}
                  busy={busy === r._id}
                  onEdit={() => setEditing(r)}
                  onResend={() => resendInvite(r)}
                  onRemove={() => setRemoving(r)}
                />
              ))}
            </ul>
          )}

          {loaded && all.length > 0 && (
            <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
              {narrowed ? (
                <>
                  <span className="font-mono text-gray-900">{rows.length}</span> of <span className="font-mono text-gray-900">{all.length}</span> people match
                </>
              ) : (
                <>
                  <span className="font-mono text-gray-900">{all.length}</span> {all.length === 1 ? 'person' : 'people'} on the staff list
                </>
              )}
              {truncated && ' (the first 500 of each job are shown)'}
            </p>
          )}
        </div>
      )}

      {editing && (
        <StaffDialog
          row={editing === 'new' ? null : editing}
          defaultType={defaultType}
          isYou={editing !== 'new' && editing.account?.userId === meId}
          emailReady={emailReady}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}

      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && busy === null && setRemoving(null)}
            title={`Remove ${staffName(removing)}?`}
            description={
              <>
                For someone added by mistake. Their profile{removing.account ? ' and their unused sign-in account are' : ' is'} deleted, and this can’t be undone. If they
                worked here, mark them inactive instead.
              </>
            }
          >
            <button type="button" onClick={() => setRemoving(null)} disabled={busy !== null} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}>
              Keep
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              aria-busy={busy !== null}
              className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              {busy !== null ? 'Removing…' : 'Remove'}
            </button>
          </AlertDialog>,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function StaffRowItem({
  r,
  index,
  now,
  isYou,
  canEmail,
  busy,
  onEdit,
  onResend,
  onRemove,
}: {
  r: StaffRow;
  index: number;
  now: number;
  isYou: boolean;
  canEmail: boolean;
  busy: boolean;
  onEdit: () => void;
  onResend: () => void;
  onRemove: () => void;
}) {
  const name = staffName(r);
  const state = accountState(r, now);
  const invited = state === 'invited' || state === 'invite-expired';
  const leftCanSignIn = leftButCanSignIn(r);
  const work = workLine(r);
  const look = STATUS_LOOK[r.status];
  const onRowClick = (e: React.MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    onEdit();
  };

  return (
    <li
      onClick={onRowClick}
      className={`motion-row-in group flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-gray-50 ${ROW_GRID}`}
      style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-700">
          {initials(name)}
        </span>
        <span className="min-w-0">
          <button
            type="button"
            onClick={onEdit}
            className={`block max-w-full truncate rounded text-left font-semibold ${r.status === 'inactive' ? 'text-gray-600' : 'text-gray-900'} hover:text-brand-teal-deep ${FOCUS_RING}`}
          >
            {name}
            {isYou && <span className="ml-1.5 text-xs font-semibold text-gray-500">You</span>}
          </button>
          <span className="block truncate text-sm text-gray-500">{r.email}</span>
        </span>
      </span>

      <span className="min-w-0 text-sm">
        <span className="text-gray-900">{STAFF_TYPE[r.staffType].label}</span>
        {work && <span className="block truncate text-gray-500">{work}</span>}
      </span>

      <span className="text-sm">
        <span className="text-gray-500 lg:hidden">Phone: </span>
        <a href={`tel:${r.phone.replace(/[^+0-9]/g, '')}`} className={`rounded font-mono tabular-nums text-gray-700 hover:text-brand-teal-deep ${FOCUS_RING}`}>
          {r.phone}
        </a>
      </span>

      <span>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${look.badge}`}>{STAFF_STATUS[r.status].label}</span>
      </span>

      <span className="min-w-0 text-sm">
        {state === 'none' ? (
          <span className="text-amber-800">No sign-in account</span>
        ) : (
          <>
            <StateBadge state={state} />
            {leftCanSignIn ? (
              <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-700">
                <Svg d={ICONS.alert} className="h-3.5 w-3.5 shrink-0" />
                Inactive here, but can still sign in
              </span>
            ) : invited ? (
              <span className={`mt-0.5 block truncate text-xs ${state === 'invite-expired' ? 'text-amber-800' : 'text-gray-500'}`}>{inviteLine(r.account!, state)}</span>
            ) : state === 'active' ? (
              <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-gray-500">Last in: {lastSeen(r.account!.lastLogin)}</span>
            ) : null}
          </>
        )}
      </span>

      <span className="flex items-center gap-1 lg:justify-end">
        {invited && !isYou && canEmail && r.account?.status === 'active' && (
          <button
            type="button"
            onClick={onResend}
            disabled={busy}
            aria-label={`Send ${name} a new invite`}
            className={`rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
          >
            {busy ? 'Sending…' : 'Send invite again'}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${name}`}
          className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-gray-900 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.edit} />
        </button>
        {removable(r) && !isYou && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className={`rounded-md p-2 text-gray-500 opacity-70 transition hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 focus-visible:opacity-100 ${FOCUS_RING}`}
          >
            <Svg d={ICONS.trash} />
          </button>
        )}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Insights: who is working, in which job, and who can get in
// ---------------------------------------------------------------------------

function FilterRow({
  on,
  onClick,
  label,
  n,
  tone,
  swatch,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  n: number;
  tone?: string;
  swatch?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
        on ? 'bg-brand-teal-light/60' : ''
      }`}
    >
      <span className={`flex min-w-0 items-center gap-2 ${n > 0 && tone ? tone : 'text-gray-700'} ${on ? 'font-semibold' : ''}`}>
        {swatch}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n.toLocaleString('en-US')}</span>
    </button>
  );
}

function Insights({
  rows,
  now,
  type,
  status,
  show,
  onType,
  onStatus,
  onShow,
}: {
  rows: StaffRow[];
  now: number;
  type: StaffType | '';
  status: StaffStatus | '';
  show: StaffShow | '';
  onType: (t: StaffType) => void;
  onStatus: (s: StaffStatus) => void;
  onShow: (s: StaffShow) => void;
}) {
  const byStatus = STAFF_STATUSES.map((s) => ({ s, n: rows.filter((r) => r.status === s).length }));
  const working = rows.filter((r) => r.status !== 'inactive');
  const byType = STAFF_TYPES.map((t) => ({ t, n: working.filter((r) => r.staffType === t).length })).sort((a, b) => b.n - a.n);
  const maxType = Math.max(1, ...byType.map((x) => x.n));
  const canSignIn = working.filter((r) => accountState(r, now) === 'active').length;
  const showCount = (s: StaffShow) => rows.filter((r) => matchesShow(r, s, now)).length;
  const tone: Partial<Record<StaffShow, string>> = {
    'left-can-sign-in': 'text-red-700',
    'invite-expired': 'text-amber-800',
    none: 'text-amber-800',
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid -mr-px -mb-px grid-cols-1 lg:grid-cols-3">
        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="staff-status-h">
          <h2 id="staff-status-h" className="text-sm text-gray-600">
            Working here
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">{byStatus[0].n.toLocaleString('en-US')}</p>
          <p className="mt-1 text-sm text-gray-500">active, of {rows.length} on the list</p>
          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded" aria-hidden="true">
            {byStatus
              .filter(({ n }) => n > 0)
              .map(({ s, n }, i) => (
                <span
                  key={s}
                  className={`motion-seg-grow h-full transition-opacity duration-200 ${STATUS_LOOK[s].fill ? '' : 'ring-1 ring-inset ring-gray-300'}`}
                  style={{ flexGrow: n, flexBasis: 0, background: STATUS_LOOK[s].fill ?? '#FFFFFF', opacity: status && status !== s ? 0.3 : 1, animationDelay: `${i * 60}ms` }}
                />
              ))}
          </div>
          <div className="mt-3 space-y-0.5" role="group" aria-label="Filter by status">
            {byStatus.map(({ s, n }) => (
              <FilterRow
                key={s}
                on={status === s}
                onClick={() => onStatus(s)}
                label={STAFF_STATUS[s].label}
                n={n}
                swatch={
                  <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-sm ${STATUS_LOOK[s].fill ? '' : 'ring-1 ring-inset ring-gray-400'}`}
                    style={{ background: STATUS_LOOK[s].fill ?? '#FFFFFF' }}
                  />
                }
              />
            ))}
          </div>
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="staff-job-h">
          <h2 id="staff-job-h" className="text-sm text-gray-600">
            By job
          </h2>
          <ul className="mt-2 space-y-1" role="group" aria-label="Filter by job">
            {byType.map(({ t, n }, i) => {
              const on = type === t;
              return (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onType(t)}
                    aria-label={`${STAFF_TYPE[t].plural}: ${n}${on ? ', filtering' : ''}`}
                    className={`-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${on ? 'bg-brand-teal-light/60' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={on ? 'font-semibold text-gray-900' : 'text-gray-700'}>{STAFF_TYPE[t].plural}</span>
                      <span className="shrink-0 font-mono tabular-nums text-gray-900">{n.toLocaleString('en-US')}</span>
                    </span>
                    <span className="mt-1 block h-1.5 rounded-r bg-gray-100" aria-hidden="true">
                      <span
                        className="motion-bar-grow block h-full rounded-r"
                        style={{ width: `${(n / maxType) * 100}%`, background: on ? '#0A7F7E' : SERIES.teal, opacity: type && !on ? 0.3 : 1, animationDelay: `${i * 50}ms` }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-gray-500">Active and on leave; inactive staff aren’t counted.</p>
        </section>

        <section className="border-r border-b border-gray-200 p-5" aria-labelledby="staff-signin-h">
          <h2 id="staff-signin-h" className="text-sm text-gray-600">
            Can sign in
          </h2>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-gray-900">
            {canSignIn.toLocaleString('en-US')}
            <span className="text-lg text-gray-500"> of {working.length.toLocaleString('en-US')}</span>
          </p>
          <div
            role="meter"
            aria-label="Working staff who can sign in"
            aria-valuemin={0}
            aria-valuemax={working.length}
            aria-valuenow={canSignIn}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
          >
            <div className="motion-bar-grow h-full rounded-full" style={{ width: `${working.length ? (canSignIn / working.length) * 100 : 0}%`, background: SERIES.teal }} />
          </div>
          <div className="mt-3 space-y-0.5" role="group" aria-label="Filter by sign-in">
            {STAFF_SHOWS.map((s) => (
              <FilterRow key={s} on={show === s} onClick={() => onShow(s)} label={STAFF_SHOW_LABEL[s]} n={showCount(s)} tone={tone[s]} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Empty({ narrowed, onClear, onAdd }: { narrowed: boolean; onClear: () => void; onAdd: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={narrowed ? ICONS.search : ICONS.users} className="h-5 w-5" />
      </div>
      {narrowed ? (
        <>
          <p className="font-semibold text-gray-900">No one matches</p>
          <p className="mt-1 text-sm text-gray-500">Check the spelling, or loosen a filter.</p>
          <button type="button" onClick={onClear} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            Clear search and filters
          </button>
        </>
      ) : (
        <>
          <p className="font-semibold text-gray-900">No staff yet</p>
          <p className="mt-1 text-sm text-gray-500">Add your nurses, receptionists and accountants; each gets an invite to set their own password.</p>
          <button
            type="button"
            onClick={onAdd}
            className={`mt-5 inline-flex items-center gap-2 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
          >
            <Svg d={ICONS.plus} />
            Add staff member
          </button>
        </>
      )}
    </div>
  );
}
