'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { DEFAULT_PAGE_SIZE } from '@/lib/page-size';
import PageSizeSelect from './ui/PageSizeSelect';
import {
  GROUP_KEYS,
  NOTIFICATION_GROUPS,
  TYPE_LABEL,
  UNREAD_EVENT,
  groupOf,
  notificationHref,
  type NotificationGroup,
  type NotificationType,
} from '@/lib/notification-kinds';

interface Note {
  _id: string;
  type: NotificationType;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string;
  relatedEntity?: { type: string; id: string } | null;
  actionUrl?: string | null;
  read: boolean;
  createdAt: string;
}

interface Page {
  notifications: Note[];
  hasMore: boolean;
  unreadCount: number;
  unreadByGroup: Partial<Record<NotificationGroup, number>>;
}

type View = 'all' | 'unread';


const ICONS = {
  ...ICON,
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  envelopeOpen: 'M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76',
  envelope: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Yesterday", "Monday, Oct 13" within the week, else "Oct 2, 2026". */
function dayHeading(iso: string, today: number) {
  const day = startOfDay(new Date(iso));
  const diff = Math.round((today - day) / DAY);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(iso);
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function NotificationsPageClient() {
  const router = useRouter();
  const [view, setView] = useState<View>('all');
  const [group, setGroup] = useState<NotificationGroup | ''>('');
  // Rows per batch: the first load and each "Show older".
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  // Rows from "Show older", kept for the list they were loaded under.
  const [older, setOlder] = useState<{ base: string; rows: Note[]; hasMore: boolean } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // What this page changed since the last response: read toggles and deletions by id, and the
  // unread counts they move.
  const [overrides, setOverrides] = useState<Record<string, { read?: boolean; deleted?: boolean }>>({});
  const [adjust, setAdjust] = useState<{ at: number; total: number; byGroup: Partial<Record<NotificationGroup, number>> }>({ at: 0, total: 0, byGroup: {} });
  const [error, setError] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const params = new URLSearchParams({ limit: String(pageSize) });
  if (view === 'unread') params.set('read', 'false');
  if (group) params.set('group', group);
  const base = `/api/notifications?${params}`;
  const res = useKeyedFetch<Page>(base);
  const page = res.value;

  // Reload when the tab comes back, so a list left open doesn't go stale.
  const reload = res.reload;
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const live = adjust.at === res.receivedAt ? adjust : { total: 0, byGroup: {} as Partial<Record<NotificationGroup, number>> };
  const unread = Math.max(0, (page?.unreadCount ?? 0) + live.total);
  const unreadIn = (g: NotificationGroup) => Math.max(0, (page?.unreadByGroup[g] ?? 0) + (live.byGroup[g] ?? 0));

  // Keep the header's bell in step.
  const known = page !== null;
  useEffect(() => {
    if (known) window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: unread }));
  }, [known, unread]);

  const olderRows = older?.base === base && res.valueUrl === base ? older.rows : [];
  const hasMore = older?.base === base && res.valueUrl === base ? older.hasMore : (page?.hasMore ?? false);
  const rows = [...(page?.notifications ?? []), ...olderRows]
    .filter((n) => !overrides[n._id]?.deleted)
    .map((n) => (overrides[n._id]?.read !== undefined ? { ...n, read: overrides[n._id].read! } : n));
  const loaded = page !== null;
  const refreshing = res.loading && loaded;

  const bump = (n: Note, by: number) => {
    const g = groupOf(n.type);
    setAdjust((a) => {
      const cur = a.at === res.receivedAt ? a : { at: res.receivedAt, total: 0, byGroup: {} };
      return { at: res.receivedAt, total: cur.total + by, byGroup: g ? { ...cur.byGroup, [g]: (cur.byGroup[g] ?? 0) + by } : cur.byGroup };
    });
  };

  const setRead = async (n: Note, read: boolean) => {
    if (n.read === read) return;
    setOverrides((o) => ({ ...o, [n._id]: { ...o[n._id], read } }));
    bump(n, read ? -1 : 1);
    try {
      const r = await fetch(`/api/notifications/${n._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read }) });
      if (!r.ok) throw new Error();
    } catch {
      setOverrides((o) => ({ ...o, [n._id]: { ...o[n._id], read: !read } }));
      bump(n, read ? 1 : -1);
      setError(`“${n.title}” couldn’t be marked ${read ? 'read' : 'unread'}. Check your connection and try again.`);
    }
  };

  const remove = async (n: Note) => {
    setOverrides((o) => ({ ...o, [n._id]: { ...o[n._id], deleted: true } }));
    if (!n.read) bump(n, -1);
    try {
      const r = await fetch(`/api/notifications/${n._id}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error();
    } catch {
      setOverrides((o) => ({ ...o, [n._id]: { ...o[n._id], deleted: false } }));
      if (!n.read) bump(n, 1);
      setError(`“${n.title}” couldn’t be removed. Try again.`);
    }
  };

  const markAll = async () => {
    if (busyAll) return;
    setBusyAll(true);
    setError(null);
    try {
      const r = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(group ? { group } : {}),
      });
      if (!r.ok) throw new Error();
      setOverrides({});
      setOlder(null);
      res.reload();
    } catch {
      setError('Nothing was marked read. Check your connection and try again.');
    } finally {
      setBusyAll(false);
    }
  };

  const showOlder = async () => {
    const last = rows[rows.length - 1];
    if (!last || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await fetch(`${base}&before=${encodeURIComponent(last.createdAt)}`);
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.success) throw new Error();
      setOlder({ base, rows: [...olderRows, ...json.data.notifications], hasMore: json.data.hasMore });
    } catch {
      setError('Older notifications didn’t load. Try again.');
    } finally {
      setLoadingOlder(false);
    }
  };

  const open = (n: Note) => {
    const href = notificationHref(n);
    if (!n.read) void setRead(n, true);
    if (href) router.push(href);
  };

  const pick = (next: { view?: View; group?: NotificationGroup | '' }) => {
    if (next.view !== undefined) setView(next.view);
    if (next.group !== undefined) setGroup(next.group);
    setError(null);
  };

  // Day groups, newest first.
  const today = startOfDay(new Date(res.receivedAt || 0));
  const days: { heading: string; items: Note[] }[] = [];
  for (const n of rows) {
    const h = dayHeading(n.createdAt, today);
    if (days[days.length - 1]?.heading === h) days[days.length - 1].items.push(n);
    else days.push({ heading: h, items: [n] });
  }
  const groupsWithUnread = GROUP_KEYS.filter((g) => unreadIn(g) > 0);
  const shownGroups = group && !groupsWithUnread.includes(group) ? [...groupsWithUnread, group] : groupsWithUnread;
  const markLabel = group ? `Mark ${NOTIFICATION_GROUPS[group].label.toLowerCase()} read` : 'Mark all as read';
  const markCount = group ? unreadIn(group) : unread;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Notifications</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {!loaded ? (
                'What the clinic needs you to know.'
              ) : unread === 0 ? (
                'You’re up to date.'
              ) : (
                <>
                  <span className="font-mono text-gray-900">{unread.toLocaleString('en-US')}</span> unread. Opening one marks it read.
                </>
              )}
            </p>
          </div>
          {markCount > 0 && (
            <button
              type="button"
              onClick={markAll}
              disabled={busyAll}
              aria-busy={busyAll}
              className={`inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.check} />
              {busyAll ? 'Marking…' : markLabel}
              <span className="font-mono text-gray-500">{markCount}</span>
            </button>
          )}
        </header>

        {/* View and kind */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div role="group" aria-label="Show" className="inline-flex w-fit rounded-md border border-gray-200 bg-white p-1">
            {(['all', 'unread'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => pick({ view: v })}
                className={`rounded px-3.5 py-1.5 text-sm font-medium transition-colors ${FOCUS_RING} ${view === v ? 'bg-brand-teal-dark text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
              >
                {v === 'all' ? 'All' : 'Unread'}
                {v === 'unread' && unread > 0 && <span className={`ml-1.5 font-mono ${view === v ? 'text-white/85' : 'text-gray-500'}`}>{unread}</span>}
              </button>
            ))}
          </div>
          {shownGroups.length > 0 && (
            <ul className="flex flex-wrap items-center gap-2" aria-label="Kind of notification">
              {shownGroups.map((g) => {
                const on = group === g;
                const n = unreadIn(g);
                return (
                  <li key={g}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => pick({ group: on ? '' : g })}
                      aria-label={`${NOTIFICATION_GROUPS[g].label}: ${n} unread${on ? ', filtering' : ''}`}
                      className={`motion-chip-in inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${FOCUS_RING} ${
                        on ? 'border-brand-teal-dark bg-brand-teal-light text-brand-teal-deep' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-900'
                      }`}
                    >
                      {NOTIFICATION_GROUPS[g].label}
                      {n > 0 && <span className="font-mono text-xs">{n}</span>}
                      {on && <Svg d={ICONS.x} className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {(error || res.error) && (
          <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <p>{error ?? `Notifications didn’t load (${res.error}).`}</p>
            {error ? (
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
                <Svg d={ICONS.x} />
              </button>
            ) : (
              <button type="button" onClick={res.reload} className={`inline-flex shrink-0 items-center gap-1.5 rounded font-semibold text-red-800 hover:text-red-900 ${FOCUS_RING}`}>
                <Svg d={ICONS.refresh} />
                Try again
              </button>
            )}
          </div>
        )}

        <div aria-busy={res.loading}>
          {!loaded ? (
            res.error ? null : (
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-hidden="true">
                <ul className="divide-y divide-gray-100 animate-pulse">
                  {Array.from({ length: pageSize }).map((_, i) => (
                    <li key={i} className="space-y-2 px-5 py-4">
                      <span className="block h-3.5 w-56 rounded bg-gray-100" />
                      <span className="block h-3 w-80 max-w-full rounded bg-gray-50" />
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : rows.length === 0 ? (
            <Empty view={view} group={group} onShowAll={() => pick({ view: 'all', group: '' })} />
          ) : (
            <div key={base} className={`flex flex-col gap-6 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`}>
              {days.map((d) => (
                <section key={d.heading} aria-label={d.heading} className="motion-panel-in">
                  <h2 className="mb-2 text-sm font-semibold text-gray-600">{d.heading}</h2>
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {d.items.map((n, i) => (
                      <Row key={n._id} n={n} index={i} onOpen={() => open(n)} onToggle={() => setRead(n, !n.read)} onRemove={() => remove(n)} />
                    ))}
                  </ul>
                </section>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PageSizeSelect id="notification-page-size" value={pageSize} onChange={setPageSize} disabled={res.loading || loadingOlder} />
                {hasMore && (
                  <button
                    type="button"
                    onClick={showOlder}
                    disabled={loadingOlder}
                    aria-busy={loadingOlder}
                    className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    {loadingOlder ? 'Loading…' : 'Show older'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {loaded && !res.loading ? `${unread} unread notifications.` : ''}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Row({ n, index, onOpen, onToggle, onRemove }: { n: Note; index: number; onOpen: () => void; onToggle: () => void; onRemove: () => void }) {
  const href = notificationHref(n);
  const urgent = n.priority === 'urgent';
  const high = n.priority === 'high';

  return (
    <li className="motion-row-in group relative flex gap-3 px-5 py-4 transition-colors hover:bg-gray-50" style={{ animationDelay: `${Math.min(index * 18, 220)}ms` }}>
      <span className="mt-1.5 flex w-2 shrink-0 justify-center" aria-hidden="true">
        {!n.read && <span className="h-2 w-2 rounded-full bg-brand-teal-dark" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          <span>{TYPE_LABEL[n.type] ?? 'Notice'}</span>
          {(urgent || high) && (
            <span className={`inline-flex items-center gap-1 font-semibold ${urgent ? 'text-red-700' : 'text-amber-800'}`}>
              <Svg d={ICON.alert} className="h-3.5 w-3.5" />
              {urgent ? 'Urgent' : 'Important'}
            </span>
          )}
          <span className="font-mono">{clock(n.createdAt)}</span>
        </p>
        {/* The whole title is the way in; it marks the notification read. */}
        <button
          type="button"
          onClick={onOpen}
          className={`mt-0.5 block max-w-full rounded text-left text-sm ${n.read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900'} ${href ? 'hover:text-brand-teal-deep' : ''} ${FOCUS_RING} after:absolute after:inset-0 after:content-['']`}
        >
          {!n.read && <span className="sr-only">Unread: </span>}
          {n.title}
          {href && <span className="sr-only"> (opens the record)</span>}
        </button>
        <p className={`mt-0.5 text-sm ${n.read ? 'text-gray-500' : 'text-gray-700'}`}>{n.message}</p>
      </div>
      <div className="relative z-10 flex shrink-0 items-start gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={n.read ? `Mark “${n.title}” unread` : `Mark “${n.title}” read`}
          title={n.read ? 'Mark unread' : 'Mark read'}
          className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:opacity-60 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={n.read ? ICONS.envelope : ICONS.envelopeOpen} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove “${n.title}”`}
          title="Remove"
          className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 sm:opacity-60 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${FOCUS_RING}`}
        >
          <Svg d={ICONS.trash} />
        </button>
      </div>
    </li>
  );
}

function Empty({ view, group, onShowAll }: { view: View; group: NotificationGroup | ''; onShowAll: () => void }) {
  const narrowed = view === 'unread' || group !== '';
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-gray-100 text-gray-500">
        <Svg d={view === 'unread' ? ICON.check : ICONS.bell} className="h-5 w-5" />
      </div>
      <p className="font-semibold text-gray-900">
        {view === 'unread' ? 'Nothing unread' : group ? `No ${NOTIFICATION_GROUPS[group].label.toLowerCase()} notifications` : 'No notifications yet'}
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
        {narrowed
          ? 'You’ve seen everything here.'
          : 'Lab results to review, stock running low, referrals waiting and other things that need you will appear here.'}
      </p>
      {narrowed && (
        <button type="button" onClick={onShowAll} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
          Show all notifications
        </button>
      )}
    </div>
  );
}
