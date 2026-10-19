import Link from 'next/link';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadSupportQueue, type QueueView } from '@/lib/platform-console';
import { CARD, LINK, SupportStatusBadge, ago } from '@/components/platform/shared';
import { FOCUS_RING } from '@/components/appointments/shared';

export const dynamic = 'force-dynamic';

const VIEWS: { key: QueueView; label: string }[] = [
  { key: 'waiting', label: 'Waiting on us' },
  { key: 'open', label: 'All open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'Everything' },
];

export default async function PlatformSupportPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  await requirePlatformPage();
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'waiting') as QueueView;
  const data = await loadSupportQueue({ view, page: Number(sp.page) || 1 });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Support</h1>

      <nav aria-label="Queue view" className="flex flex-wrap gap-1.5 text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/platform/support?view=${v.key}`}
            aria-current={view === v.key ? 'page' : undefined}
            className={`rounded-full px-3 py-1 ring-1 ring-inset ${FOCUS_RING} ${
              view === v.key ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-300 hover:ring-gray-500'
            }`}
          >
            {v.label}
            {v.key === 'waiting' && <span className="tabular-nums opacity-70"> {data.counts.waiting}</span>}
            {v.key === 'open' && <span className="tabular-nums opacity-70"> {data.counts.open}</span>}
          </Link>
        ))}
      </nav>

      <ul className={`${CARD} divide-y divide-gray-100`}>
        {data.rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <Link href={`/platform/support/${r.id}`} className={`${LINK} block truncate`}>{r.subject}</Link>
              <p className="truncate text-xs text-gray-500">
                {r.reference} · {r.clinic ? r.clinic.name : 'No clinic'} · {r.email}
                {r.source === 'medical-rep' ? ' · medical rep' : ''} · {r.category}
              </p>
            </div>
            <span className="text-xs text-gray-500">
              {r.replies} {r.replies === 1 ? 'reply' : 'replies'}
              {r.lastReplyBy === 'requester' && (r.status === 'open' || r.status === 'in-progress') ? ' · awaiting our reply' : ''}
            </span>
            <SupportStatusBadge status={r.status} />
            <span className="w-20 text-right text-xs text-gray-500">{ago(r.lastActivityAt)}</span>
          </li>
        ))}
        {data.rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-500">Nothing here.</li>}
      </ul>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {data.page} of {pages}</span>
          <span className="flex gap-3">
            {data.page > 1 && <Link className={LINK} href={`/platform/support?view=${view}&page=${data.page - 1}`}>Previous</Link>}
            {data.page < pages && <Link className={LINK} href={`/platform/support?view=${view}&page=${data.page + 1}`}>Next</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
