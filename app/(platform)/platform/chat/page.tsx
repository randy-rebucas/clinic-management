import Link from 'next/link';
import { requirePlatformPage } from '@/lib/platform-auth';
import { listSupportThreads, type SupportChatView } from '@/lib/support-chat';
import { StaffPicker } from '@/components/platform/SupportChat';
import { OUTLINE } from '@/components/platform/platform-api';
import { CARD, LINK, ago } from '@/components/platform/shared';
import { FOCUS_RING } from '@/components/appointments/shared';

export const dynamic = 'force-dynamic';

const VIEWS: { key: SupportChatView; label: string }[] = [
  { key: 'waiting', label: 'Waiting on us' },
  { key: 'all', label: 'All conversations' },
];

export default async function PlatformChatPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string; q?: string }> }) {
  await requirePlatformPage();
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'waiting') as SupportChatView;
  const q = sp.q?.trim() || '';
  const data = await listSupportThreads({ view, q, page: Number(sp.page) || 1 });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const href = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ view, ...(q ? { q } : {}) });
    for (const [k, v] of Object.entries(over)) p.set(k, String(v));
    return `/platform/chat?${p}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Support chat</h1>
          <p className="mt-1 text-sm text-gray-600">
            Each clinic staff member’s conversation with MyClinicSoft Support. Their chats with colleagues stay private.
          </p>
        </div>
        <Link href="/platform/chat/broadcast" className={OUTLINE}>Broadcast a message</Link>
      </div>

      <div className="max-w-md">
        <StaffPicker />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Conversations" className="flex flex-wrap gap-1.5 text-sm">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={href({ view: v.key, page: 1 })}
              aria-current={view === v.key ? 'page' : undefined}
              className={`rounded-full px-3 py-1 ring-1 ring-inset ${FOCUS_RING} ${
                view === v.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-300 hover:ring-gray-500'
              }`}
            >
              {v.label}
              {v.key === 'waiting' && <span className="tabular-nums opacity-70"> {data.waiting}</span>}
            </Link>
          ))}
        </nav>
        <form action="/platform/chat" className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          <label htmlFor="thread-filter" className="sr-only">Filter conversations by name or email</label>
          <input
            id="thread-filter"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Filter by name or email"
            className={`w-56 rounded-md border border-gray-300 px-3 py-1.5 text-sm ${FOCUS_RING}`}
          />
        </form>
      </div>

      <ul className={`${CARD} divide-y divide-gray-100`}>
        {data.threads.map((t) => (
          <li key={t.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <Link href={`/platform/chat/${t.userId}`} className={`${LINK} block truncate`}>{t.name}</Link>
              <p className="truncate text-xs text-gray-500">
                {t.clinic ? t.clinic.name : 'Clinic no longer on file'}
                {t.role ? ` · ${t.role}` : ''}
                {t.email ? ` · ${t.email}` : ''}
              </p>
              {t.lastMessage && (
                <p className={`mt-0.5 truncate text-sm ${t.unread ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                  {t.lastMessage.fromSupport && <span className="text-gray-500">Us: </span>}
                  {t.lastMessage.body}
                </p>
              )}
            </div>
            {t.unread > 0 && (
              <span className="rounded-full bg-amber-400 px-2 text-xs font-bold leading-5 text-brand-navy" aria-label={`${t.unread} unread`}>
                {t.unread}
              </span>
            )}
            <span className="w-20 text-right text-xs text-gray-500">{ago(t.lastMessageAt)}</span>
          </li>
        ))}
        {data.threads.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-gray-500">
            {q ? 'No conversation matches.' : view === 'waiting' ? 'Nobody is waiting on a reply.' : 'No conversations yet.'}
          </li>
        )}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {data.page} of {pages}</span>
          <span className="flex gap-3">
            {data.page > 1 && <Link className={LINK} href={href({ page: data.page - 1 })}>Previous</Link>}
            {data.page < pages && <Link className={LINK} href={href({ page: data.page + 1 })}>Next</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
