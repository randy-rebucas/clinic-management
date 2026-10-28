'use client';

import Link from 'next/link';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { URGENCY_BADGE } from '../lab-results/shared';
import { EmptyState, Panel, QuickActions, StatGrid, formatDate } from './shared';
import { FOCUS_RING } from '../appointments/shared';

interface Insights {
  status: Record<string, number>;
  waiting: { key: string; label: string; short: string; count: number }[];
  turnaround: { medianHours: number | null; results: number };
}

interface Request {
  _id: string;
  requestCode?: string;
  patient: { firstName: string; lastName: string } | null;
  orderedBy?: { name: string } | null;
  orderDate: string;
  request: { testType: string; urgency?: 'routine' | 'urgent' | 'stat' };
}

const turnaround = (h: number | null) => (h === null ? '—' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`);

/** Medical technologists: the requests to receive, the tests still at the bench, and how fast results go out. */
export default function LabDashboard() {
  const insights = useKeyedFetch<Insights>('/api/lab-results/insights');
  const fresh = useKeyedFetch<Request[]>('/api/lab-results?page=1&limit=8&status=ordered');
  const bench = useKeyedFetch<Request[]>('/api/lab-results?page=1&limit=8&status=in-progress');
  const s = insights.value?.status ?? {};
  const lateCount = insights.value?.waiting.filter((w) => w.key === '4-7' || w.key === '8+').reduce((n, w) => n + w.count, 0) ?? 0;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        <header>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Laboratory</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Requests from the doctors, tests in progress, and results to enter.</p>
        </header>

        {insights.error ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {insights.error}
          </p>
        ) : (
          <StatGrid
            items={[
              { title: 'New requests', value: insights.value ? s.ordered ?? 0 : '…', subtitle: 'Waiting to be received', href: '/lab-results', icon: 'clipboard' },
              { title: 'At the lab', value: insights.value ? s['in-progress'] ?? 0 : '…', subtitle: 'Results still to enter', href: '/lab-results', icon: 'clock' },
              {
                title: 'Waiting 4+ days',
                value: insights.value ? lateCount : '…',
                subtitle: 'Received or not',
                href: '/lab-results',
                icon: 'alert',
                alert: lateCount > 0,
              },
              {
                title: 'Turnaround',
                value: insights.value ? turnaround(insights.value.turnaround.medianHours) : '…',
                subtitle: 'Median, order to result (90 days)',
                href: '/lab-results',
                icon: 'report',
              },
            ]}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="New requests" subtitle="Newest first" viewAllHref="/lab-results">
            <RequestList state={fresh} empty="No new requests" hint="Requests the doctors send appear here." />
          </Panel>
          <Panel title="At the lab" subtitle="Received, results still to enter" viewAllHref="/lab-results">
            <RequestList state={bench} empty="Nothing in progress" hint="Receive a request to start on it." />
          </Panel>
        </div>

        <QuickActions items={[{ title: 'Lab results', href: '/lab-results', description: 'Receive requests and enter results', icon: 'clipboard' }]} />
      </div>
    </section>
  );
}

function RequestList({
  state,
  empty,
  hint,
}: {
  state: { value: Request[] | null; error: string | null };
  empty: string;
  hint: string;
}) {
  if (state.error) return <p className="px-5 py-4 text-sm text-red-700">{state.error}</p>;
  if (!state.value) return <p className="px-5 py-4 text-sm text-gray-500">Loading…</p>;
  if (state.value.length === 0) return <EmptyState icon="clipboard" title={empty} hint={hint} />;
  return (
    <ul className="divide-y divide-gray-100">
      {state.value.map((r) => {
        const urgency = r.request?.urgency ? URGENCY_BADGE[r.request.urgency] : undefined;
        const who = r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : 'Patient record unavailable';
        return (
          <li key={r._id}>
            <Link href={`/lab-results/${r._id}`} className={`flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 ${FOCUS_RING}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {r.request?.testType} <span className="font-normal text-gray-600">· {who}</span>
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {r.requestCode && <span className="font-mono">{r.requestCode} · </span>}
                  {formatDate(r.orderDate)}
                  {r.orderedBy?.name && ` · ${r.orderedBy.name}`}
                </span>
              </span>
              {urgency && <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${urgency.badge}`}>{urgency.label}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
