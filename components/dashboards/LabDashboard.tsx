'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { URGENCY_BADGE } from '../lab-results/shared';
import { EmptyState, Panel, QuickActions, StatGrid, formatDate } from './shared';
import { FOCUS_RING } from '../appointments/shared';

interface Insights {
  status: Record<string, number>;
  waiting: { key: string; label: string; short: string; count: number }[];
  turnaround: { medianHours: number | null; results: number };
}

/** One lab order (GET ?group=order): only its tests in the panel's status are listed. */
interface Request {
  _id: string;
  orderCode?: string;
  patient: { firstName: string; lastName: string } | null;
  orderedBy?: { name: string } | null;
  orderDate: string;
  urgency?: 'routine' | 'urgent' | 'stat';
  tests: { _id: string; requestCode?: string; testType?: string }[];
}

interface AtLabEntry {
  _id: string;
  queueNumber: string;
  priority: number;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  patientName?: string;
  doctor: { firstName: string; lastName: string } | null;
  tests: { _id: string; testType: string; status: string; urgency?: 'routine' | 'urgent' | 'stat' }[];
}

/**
 * Live list of patients at the lab, pushed over Server-Sent Events from /api/lab-results/at-lab.
 * The stream also signals when the open lab requests change, so the other panels can refetch.
 * EventSource reconnects by itself after a dropped or planned close; if the server refuses the
 * connection (e.g. a 401), it gives up, so we retry on a slower timer.
 */
function useAtLabStream(onRequestsChanged: () => void) {
  const [value, setValue] = useState<AtLabEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onRequestsChanged);
  useEffect(() => {
    callback.current = onRequestsChanged;
  }, [onRequestsChanged]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let lastVersion: string | null = null;
    let stopped = false;

    const connect = () => {
      source = new EventSource('/api/lab-results/at-lab');
      source.addEventListener('patients', (e) => {
        try {
          setValue(JSON.parse((e as MessageEvent<string>).data));
          setError(null);
        } catch {
          // ignore a malformed frame; the next change resends the full list
        }
      });
      source.addEventListener('requests', (e) => {
        const version = (e as MessageEvent<string>).data;
        // The first version on each (re)connect only tells us the baseline, unless it moved while we were away.
        if (lastVersion !== null && version !== lastVersion) callback.current();
        lastVersion = version;
      });
      source.onerror = () => {
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          setError('Live updates paused. Reconnecting…');
          source.close();
          retry = setTimeout(connect, 10_000);
        }
      };
    };
    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, []);

  return { value, error };
}

const turnaround = (h: number | null) => (h === null ? '—' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`);

/** Medical technologists: the requests to receive, the tests still at the bench, and how fast results go out. */
export default function LabDashboard() {
  const insights = useKeyedFetch<Insights>('/api/lab-results/insights');
  const fresh = useKeyedFetch<Request[]>('/api/lab-results?page=1&limit=8&group=order&status=ordered');
  const bench = useKeyedFetch<Request[]>('/api/lab-results?page=1&limit=8&group=order&status=in-progress');
  const { reload: reloadInsights } = insights;
  const { reload: reloadFresh } = fresh;
  const { reload: reloadBench } = bench;
  const onRequestsChanged = useCallback(() => {
    reloadInsights();
    reloadFresh();
    reloadBench();
  }, [reloadInsights, reloadFresh, reloadBench]);
  const atLab = useAtLabStream(onRequestsChanged);
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

        <Panel
          title="Patients at the lab"
          subtitle={atLab.value ? `${atLab.value.length} sent over from the queue · their place in line is kept` : 'Sent over from the queue'}
        >
          <AtLabList state={atLab} />
        </Panel>

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

function AtLabList({ state }: { state: { value: AtLabEntry[] | null; error: string | null } }) {
  if (!state.value) return <p className={`px-5 py-4 text-sm ${state.error ? 'text-red-700' : 'text-gray-500'}`}>{state.error ?? 'Loading…'}</p>;
  const notice = state.error && <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs font-medium text-amber-800">{state.error}</p>;
  if (state.value.length === 0)
    return (
      <>
        {notice}
        <EmptyState icon="users" title="No patients at the lab" hint="Patients a doctor sends to the lab from the queue appear here." />
      </>
    );
  return (
    <>
    {notice}
    <ul className="divide-y divide-gray-100">
      {state.value.map((e) => {
        const who = e.patient ? `${e.patient.firstName} ${e.patient.lastName}`.trim() : e.patientName || 'Patient record unavailable';
        const doctor = e.doctor ? `Dr. ${e.doctor.firstName} ${e.doctor.lastName}`.trim() : null;
        return (
          <li key={e._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded bg-brand-teal-light px-2 py-0.5 font-mono text-sm font-semibold text-brand-teal-dark">{e.queueNumber}</span>
              <span className="min-w-0">
                {e.patient ? (
                  <Link href={`/patients/${e.patient._id}`} className={`block truncate text-sm font-semibold text-gray-900 hover:underline rounded ${FOCUS_RING}`}>
                    {who}
                  </Link>
                ) : (
                  <span className="block truncate text-sm font-semibold text-gray-900">{who}</span>
                )}
                <span className="block truncate text-xs text-gray-500">
                  {e.patient?.patientCode && <span className="font-mono">{e.patient.patientCode}</span>}
                  {e.patient?.patientCode && doctor && ' · '}
                  {doctor}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              {e.tests.length === 0 ? (
                <span className="text-xs text-gray-500">No open lab request</span>
              ) : (
                e.tests.map((t) => {
                  const urgency = t.urgency && t.urgency !== 'routine' ? URGENCY_BADGE[t.urgency] : undefined;
                  return (
                    <Link
                      key={t._id}
                      href={`/lab-results/${t._id}`}
                      className={`inline-flex items-center gap-1.5 rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 ${FOCUS_RING}`}
                    >
                      {t.testType}
                      <span className="text-gray-500">· {t.status === 'ordered' ? 'new' : 'in progress'}</span>
                      {urgency && <span className={`rounded px-1 font-semibold ring-1 ring-inset ${urgency.badge}`}>{urgency.label}</span>}
                    </Link>
                  );
                })
              )}
            </div>
          </li>
        );
      })}
    </ul>
    </>
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
        const urgency = r.urgency ? URGENCY_BADGE[r.urgency] : undefined;
        const who = r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : 'Patient record unavailable';
        const code = r.orderCode ?? r.tests[0]?.requestCode;
        return (
          <li key={r._id}>
            <Link href={`/lab-results/${r.tests[0]?._id}`} className={`flex items-center justify-between gap-3 px-5 py-3 hover:bg-gray-50 ${FOCUS_RING}`}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {r.tests.map((t) => t.testType).filter(Boolean).join(', ')} <span className="font-normal text-gray-600">· {who}</span>
                </span>
                <span className="block truncate text-xs text-gray-500">
                  {code && <span className="font-mono">{code} · </span>}
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
