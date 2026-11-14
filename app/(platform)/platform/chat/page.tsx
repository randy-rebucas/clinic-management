import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Inbox,
  Megaphone,
  MessagesSquare,
  Search,
  Timer,
  X,
} from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { CHAT_REPLY_DAYS, listSupportThreads, loadSupportChatStats, type SupportChatView } from '@/lib/support-chat';
import { StaffPicker } from '@/components/platform/SupportChat';
import { ColumnChart } from '@/components/platform/charts';
import { BarRow, CARD, FIELD, FOCUS_RING, H2, Initial, LINK, ago, hoursLabel } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const VIEWS: { key: SupportChatView; label: string }[] = [
  { key: 'waiting', label: 'Waiting on us' },
  { key: 'all', label: 'All conversations' },
];

const weekLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Stat({ icon: Icon, label, value, children }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {children && <div className="mt-1 text-xs text-gray-500">{children}</div>}
    </div>
  );
}

function WaitChip({ hours }: { hours: number }) {
  const tone =
    hours >= 24 ? 'bg-rose-50 text-rose-800 ring-rose-200' : hours >= 4 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-gray-50 text-gray-700 ring-gray-200';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      <Hourglass aria-hidden="true" className="size-3" />
      Waiting {hoursLabel(hours)}
    </span>
  );
}

export default async function PlatformChatPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string; q?: string }> }) {
  await requirePlatformPage();
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'waiting') as SupportChatView;
  const q = (sp.q ?? '').trim().slice(0, 100);
  const [data, stats] = await Promise.all([
    listSupportThreads({ view, q, page: Number(sp.page) || 1 }),
    loadSupportChatStats(),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const first = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = Math.min(data.total, data.page * data.pageSize);

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, q, page: undefined as unknown, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'view' && v === 'waiting')) p.set(k, String(v));
    const s = p.toString();
    return `/platform/chat${s ? `?${s}` : ''}`;
  };

  const asOf = Date.parse(stats.asOf);
  const longestHours = stats.longestWait ? (asOf - Date.parse(stats.longestWait.since)) / 3_600_000 : null;
  const weeks = stats.byWeek;
  const last4 = weeks.slice(-4).reduce((a, w) => ({ staff: a.staff + w.fromStaff, us: a.us + w.fromUs }), { staff: 0, us: 0 });
  const clinicMax = Math.max(0, ...stats.busiestClinics.map((c) => c.messages));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Support chat</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Each clinic staff member’s conversation with MyClinicSoft Support. Their chats with colleagues stay private.
          </p>
        </div>
        <Link
          href="/platform/chat/broadcast"
          className={`inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
        >
          <Megaphone aria-hidden="true" className="size-4" /> Broadcast a message
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Inbox} label="Waiting on us" value={stats.waitingThreads}>
          {stats.unreadMessages} unread {stats.unreadMessages === 1 ? 'message' : 'messages'}
        </Stat>
        <Stat icon={Hourglass} label="Longest wait" value={longestHours === null ? '—' : hoursLabel(longestHours)}>
          {stats.longestWait ? (
            <Link href={`/platform/chat/${stats.longestWait.userId}`} className={`${LINK} block truncate font-normal`}>
              {stats.longestWait.name}
            </Link>
          ) : (
            'Nobody is waiting'
          )}
        </Stat>
        <Stat icon={Timer} label="Median reply time" value={stats.reply.medianHours === null ? '—' : hoursLabel(stats.reply.medianHours)}>
          Last {CHAT_REPLY_DAYS} days · {stats.reply.replied} {stats.reply.replied === 1 ? 'reply' : 'replies'}
        </Stat>
        <Stat icon={MessagesSquare} label="Last 4 weeks" value={
          <span className="flex items-baseline gap-4">
            <span>{last4.staff}<span className="ml-1 text-sm font-normal text-gray-500">from staff</span></span>
            <span>{last4.us}<span className="ml-1 text-sm font-normal text-gray-500">from us</span></span>
          </span>
        }>
          Messages, not counting deleted ones
        </Stat>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <section className={`${CARD} p-4 lg:col-span-2`} aria-labelledby="chat-volume">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 id="chat-volume" className={H2}>Messages from staff per week</h2>
            <span className="text-xs text-gray-500">
              {stats.partial ? 'Partial: busiest weeks capped' : 'Hover a week for the count'}
            </span>
          </div>
          <div className="mt-3">
            <ColumnChart
              label="Support chat messages from clinic staff per week"
              height={200}
              format={{ kind: 'count', unit: ['message', 'messages'] }}
              points={weeks.map((w, i) => ({
                label: i % 2 === (weeks.length - 1) % 2 ? weekLabel(w.weekStart) : '',
                full: `Week of ${weekLabel(w.weekStart)}${i === weeks.length - 1 ? ' (this week)' : ''} · ${w.fromUs} from us`,
                value: w.fromStaff,
              }))}
            />
          </div>
        </section>

        <div className="space-y-4">
          <section className={`${CARD} p-4`} aria-label="Start a conversation">
            <StaffPicker />
            <p className="mt-2 text-xs text-gray-500">Opens their support thread, or starts one.</p>
          </section>
          <section className={`${CARD} p-4`} aria-labelledby="busiest">
            <h2 id="busiest" className={H2}>Busiest clinics</h2>
            <p className="text-xs text-gray-500">Messages from staff, last {CHAT_REPLY_DAYS} days</p>
            {stats.busiestClinics.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No messages from staff in that time.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {stats.busiestClinics.map((c) => (
                  <BarRow key={c.id} label={c.name} value={c.messages} max={clinicMax} right={String(c.messages)} href={`/platform/clinics/${c.id}`} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-3">
          <nav aria-label="Conversations" className="flex flex-wrap gap-1.5 text-sm">
            {VIEWS.map((v) => {
              const on = view === v.key;
              return (
                <Link
                  key={v.key}
                  href={href({ view: v.key })}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-inset ${FOCUS_RING} ${
                    on ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-gray-400'
                  }`}
                >
                  {v.label}
                  {v.key === 'waiting' && <span className={`tabular-nums ${on ? 'text-slate-300' : 'text-gray-500'}`}>{data.waiting}</span>}
                </Link>
              );
            })}
          </nav>
          <form action="/platform/chat" role="search" className="relative w-full sm:w-64">
            {view !== 'waiting' && <input type="hidden" name="view" value={view} />}
            <label htmlFor="thread-filter" className="sr-only">Filter conversations by name or email</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              id="thread-filter"
              name="q"
              type="text"
              inputMode="search"
              autoComplete="off"
              defaultValue={q}
              placeholder="Filter by name or email"
              className={`${FIELD} py-1.5 pl-9 pr-9`}
            />
            {q && (
              <Link href={href({ q: undefined })} aria-label="Clear filter" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 ${FOCUS_RING}`}>
                <X className="size-4" />
              </Link>
            )}
          </form>
        </div>

        <ul className="divide-y divide-gray-100">
          {data.threads.map((t) => {
            const since = t.unread > 0 ? stats.waitingSince[t.userId] : undefined;
            return (
              <li key={t.userId} className={`flex gap-3 px-4 py-3 hover:bg-gray-50 ${t.unread ? 'bg-amber-50/30' : ''}`}>
                <Initial name={t.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/platform/chat/${t.userId}`} className={`${LINK} min-w-0 max-w-full truncate`}>{t.name}</Link>
                    {since && <WaitChip hours={(asOf - Date.parse(since)) / 3_600_000} />}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {t.clinic ? (
                      <Link href={`/platform/clinics/${t.clinic.id}`} className="hover:text-gray-800 hover:underline">{t.clinic.name}</Link>
                    ) : 'Clinic no longer on file'}
                    {t.role ? ` · ${t.role}` : ''}
                    {t.email ? ` · ${t.email}` : ''}
                  </p>
                  {t.lastMessage && (
                    <p className={`mt-1 truncate text-sm ${t.unread ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                      {t.lastMessage.fromSupport && <span className="font-normal text-gray-500">Us: </span>}
                      {t.lastMessage.body}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="whitespace-nowrap text-xs text-gray-500">{ago(t.lastMessageAt)}</span>
                  {t.unread > 0 && (
                    <span className="rounded-full bg-amber-400 px-2 text-xs font-bold leading-5 text-brand-navy">
                      {t.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
          {data.threads.length === 0 && (
            <li className="px-4 py-12 text-center">
              <MessagesSquare aria-hidden="true" className="mx-auto size-7 text-gray-300" />
              <p className="mt-2 text-sm text-gray-600">
                {q ? 'No conversation matches.' : view === 'waiting' ? 'Nobody is waiting on a reply.' : 'No conversations yet.'}
              </p>
              {q && <Link href={href({ q: undefined })} className={`${LINK} mt-1 inline-block text-sm`}>Clear filter</Link>}
            </li>
          )}
        </ul>
      </div>

      {data.total > 0 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm text-gray-600">
          <span className="tabular-nums">{first}–{last} of {data.total}</span>
          {pages > 1 && (
            <span className="flex items-center gap-1">
              {data.page > 1 && (
                <Link className={`inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 hover:border-gray-400 ${FOCUS_RING}`} href={href({ page: data.page - 1 })}>
                  <ChevronLeft aria-hidden="true" className="size-4" /> Previous
                </Link>
              )}
              <span className="px-2 tabular-nums">Page {data.page} of {pages}</span>
              {data.page < pages && (
                <Link className={`inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 hover:border-gray-400 ${FOCUS_RING}`} href={href({ page: data.page + 1 })}>
                  Next <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              )}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
