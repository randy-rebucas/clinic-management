import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import {
  BriefcaseMedical,
  Building2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Inbox,
  MessageSquare,
  Search,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import {
  FIRST_REPLY_DAYS,
  WAIT_BUCKETS,
  loadSupportQueue,
  type QueueView,
  type SupportQueueRow,
} from '@/lib/platform-console';
import { ColumnChart } from '@/components/platform/charts';
import {
  BarRow,
  CARD,
  FIELD,
  FOCUS_RING,
  H2,
  LINK,
  SupportStatusBadge,
  ago,
  hoursLabel,
} from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const VIEWS: { key: QueueView; label: string }[] = [
  { key: 'waiting', label: 'Waiting on us' },
  { key: 'open', label: 'All open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'Everything' },
];

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  technical: 'Technical',
  billing: 'Billing',
  account: 'Account',
  onboarding: 'Onboarding',
  other: 'Other',
};

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

/** Hours the requester has been waiting on us, or null when the ball is in their court or it's closed. */
function waitingHours(r: SupportQueueRow, asOf: string): number | null {
  if ((r.status !== 'open' && r.status !== 'in-progress') || r.lastReplyBy === 'platform') return null;
  return (Date.parse(asOf) - Date.parse(r.lastActivityAt)) / 3_600_000;
}

function WaitChip({ hours }: { hours: number }) {
  const tone =
    hours >= 72 ? 'bg-rose-50 text-rose-800 ring-rose-200' : hours >= 24 ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-gray-50 text-gray-700 ring-gray-200';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      <Hourglass aria-hidden="true" className="size-3" />
      Waiting {hoursLabel(hours)}
    </span>
  );
}

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; q?: string }>;
}) {
  await requirePlatformPage();
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'waiting') as QueueView;
  const q = (sp.q ?? '').slice(0, 100);
  const data = await loadSupportQueue({ view, page: Number(sp.page) || 1, q });
  const { stats } = data;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const first = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = Math.min(data.total, data.page * data.pageSize);

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: view === 'waiting' ? undefined : view, q, page: undefined as unknown, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'view' && v === 'waiting')) p.set(k, String(v));
    const s = p.toString();
    return `/platform/support${s ? `?${s}` : ''}`;
  };

  const oldestHours = stats.oldestWaiting ? (Date.parse(stats.asOf) - Date.parse(stats.oldestWaiting.since)) / 3_600_000 : null;
  const waitMax = Math.max(...stats.waitAges);
  const catMax = Math.max(0, ...stats.openByCategory.map((c) => c.count));
  const weeks = stats.openedByWeek;
  const recent4 = weeks.slice(-4).reduce((a, w) => a + w.count, 0);
  const fr = stats.firstReply;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Support</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Requests from clinic staff and medical reps. Live chat is under <Link href="/platform/chat" className={LINK}>Chat</Link>.
          </p>
        </div>
        <form className="relative w-full sm:w-72" action="/platform/support" role="search">
          <label className="sr-only" htmlFor="q">Search requests</label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input
            id="q"
            name="q"
            type="text"
            inputMode="search"
            autoComplete="off"
            defaultValue={q}
            placeholder="Subject, email or SR-reference"
            className={`${FIELD} pl-9 pr-9`}
          />
          {view !== 'waiting' && <input type="hidden" name="view" value={view} />}
          {q && (
            <Link href={href({ q: undefined })} aria-label="Clear search" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 ${FOCUS_RING}`}>
              <X className="size-4" />
            </Link>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Inbox} label="Waiting on us" value={data.counts.waiting}>
          {data.counts.open} open in all
        </Stat>
        <Stat icon={Hourglass} label="Longest wait" value={oldestHours === null ? '—' : hoursLabel(oldestHours)}>
          {stats.oldestWaiting ? (
            <Link href={`/platform/support/${stats.oldestWaiting.id}`} className={`${LINK} block truncate font-normal`}>
              {stats.oldestWaiting.subject}
            </Link>
          ) : (
            'Nobody is waiting'
          )}
        </Stat>
        <Stat icon={Timer} label="Median first reply" value={fr.medianHours === null ? '—' : hoursLabel(fr.medianHours)}>
          Last {FIRST_REPLY_DAYS} days · {fr.answered} answered
          {fr.unanswered > 0 && <span className="font-medium text-amber-700"> · {fr.unanswered} not yet</span>}
        </Stat>
        <Stat icon={Users} label="Open, by who asked" value={
          <span className="flex items-baseline gap-4">
            <span>{stats.openBySource.clinic}<span className="ml-1 text-sm font-normal text-gray-500">clinics</span></span>
            <span>{stats.openBySource.rep}<span className="ml-1 text-sm font-normal text-gray-500">reps</span></span>
          </span>
        } />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <section className={`${CARD} p-4 lg:col-span-2`} aria-labelledby="new-requests">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="new-requests" className={H2}>New requests per week</h2>
            <span className="text-xs text-gray-500 tabular-nums">{recent4} in the last 4 weeks</span>
          </div>
          <div className="mt-3">
            <ColumnChart
              label="Support requests opened per week"
              height={200}
              format={{ kind: 'count', unit: ['request', 'requests'] }}
              points={weeks.map((w, i) => ({
                label: i % 2 === (weeks.length - 1) % 2 ? weekLabel(w.weekStart) : '',
                full: `Week of ${weekLabel(w.weekStart)}${i === weeks.length - 1 ? ' (this week)' : ''}`,
                value: w.count,
              }))}
            />
          </div>
        </section>

        <section className={`${CARD} space-y-5 p-4`} aria-label="Open requests">
          <div>
            <h2 className={H2}>How long they&apos;ve waited</h2>
            {data.counts.waiting === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Every open request has our reply.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {WAIT_BUCKETS.map((b, i) => (
                  <BarRow key={b.key} label={b.label} value={stats.waitAges[i]} max={waitMax} right={String(stats.waitAges[i])} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className={H2}>Open by topic</h2>
            {stats.openByCategory.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No open requests.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {stats.openByCategory.map((c) => (
                  <BarRow key={c.category} label={CATEGORY_LABEL[c.category] ?? c.category} value={c.count} max={catMax} right={String(c.count)} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className={CARD}>
        <nav aria-label="Queue view" className="flex flex-wrap gap-1.5 border-b border-gray-200 p-3 text-sm">
          {VIEWS.map((v) => {
            const on = view === v.key;
            const count = v.key === 'waiting' ? data.counts.waiting : v.key === 'open' ? data.counts.open : null;
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
                {count !== null && <span className={`tabular-nums ${on ? 'text-slate-300' : 'text-gray-500'}`}>{count}</span>}
              </Link>
            );
          })}
        </nav>

        <ul className="divide-y divide-gray-100">
          {data.rows.map((r) => {
            const waiting = waitingHours(r, stats.asOf);
            const Src = r.source === 'clinic' ? Building2 : BriefcaseMedical;
            return (
              <li key={r.id} className="flex gap-3 px-4 py-3 hover:bg-gray-50">
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-deep"
                  title={r.source === 'clinic' ? 'Clinic staff' : 'Medical rep'}
                >
                  <Src aria-hidden="true" className="size-4" />
                  <span className="sr-only">{r.source === 'clinic' ? 'From clinic staff' : 'From a medical rep'}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={`/platform/support/${r.id}`} className={`${LINK} min-w-0 max-w-full truncate`}>{r.subject}</Link>
                    {waiting !== null && <WaitChip hours={waiting} />}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    <span className="font-mono">{r.reference}</span>
                    {' · '}
                    {r.clinic ? (
                      <Link href={`/platform/clinics/${r.clinic.id}`} className="hover:text-gray-800 hover:underline">{r.clinic.name}</Link>
                    ) : r.source === 'clinic' ? 'No clinic' : 'Medical rep'}
                    {' · '}
                    {r.email} · {CATEGORY_LABEL[r.category] ?? r.category}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <span className="hidden items-center gap-1 text-xs tabular-nums text-gray-500 sm:inline-flex" title={`${r.replies} ${r.replies === 1 ? 'reply' : 'replies'}`}>
                    <MessageSquare aria-hidden="true" className="size-3.5" />
                    {r.replies}
                    <span className="sr-only">{r.replies === 1 ? 'reply' : 'replies'}</span>
                  </span>
                  <SupportStatusBadge status={r.status} />
                  <span className="whitespace-nowrap text-xs text-gray-500 sm:w-20 sm:text-right">{ago(r.lastActivityAt)}</span>
                </div>
              </li>
            );
          })}
          {data.rows.length === 0 && (
            <li className="px-4 py-12 text-center">
              <Inbox aria-hidden="true" className="mx-auto size-7 text-gray-300" />
              <p className="mt-2 text-sm text-gray-600">
                {q ? 'No requests match.' : view === 'waiting' ? 'Nobody is waiting on a reply.' : 'Nothing here.'}
              </p>
              {q && <Link href={href({ q: undefined })} className={`${LINK} mt-1 inline-block text-sm`}>Clear search</Link>}
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
