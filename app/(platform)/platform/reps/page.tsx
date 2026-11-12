import Link from 'next/link';
import { requirePlatformPage } from '@/lib/platform-auth';
import { REP_STATES, REP_STATE_LABEL, loadPlatformReps, type RepState } from '@/lib/platform-reps';
import { CARD, LINK, ago, day } from '@/components/platform/shared';
import { RepStateBadge, PlanText } from '@/components/platform/RepBits';
import { FIELD, FOCUS_RING } from '@/components/appointments/shared';

export const dynamic = 'force-dynamic';

export default async function PlatformRepsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
}) {
  await requirePlatformPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const state = (REP_STATES as string[]).includes(sp.state ?? '') ? (sp.state as RepState) : '';
  const data = await loadPlatformReps({ q, state, page: Number(sp.page) || 1 });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, state, page: undefined as unknown, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return `/platform/reps${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Medical reps</h1>
        <p className="text-sm text-gray-500">Every registered medical representative, across all clinics.</p>
      </div>

      <form className="flex flex-wrap gap-2" action="/platform/reps">
        <label className="sr-only" htmlFor="q">Search reps</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, email, company, territory or phone" className={`${FIELD} max-w-sm`} />
        {state && <input type="hidden" name="state" value={state} />}
        <button className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>Search</button>
      </form>

      <nav aria-label="Filter by state" className="flex flex-wrap gap-1.5 text-sm">
        {(['', ...REP_STATES] as const).map((s) => (
          <Link
            key={s || 'all'}
            href={href({ state: s })}
            aria-current={state === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 ring-1 ring-inset ${FOCUS_RING} ${
              state === s ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-300 hover:ring-gray-500'
            }`}
          >
            {s ? REP_STATE_LABEL[s] : 'All'} <span className="tabular-nums opacity-70">{data.counts[s || 'all']}</span>
          </Link>
        ))}
      </nav>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Rep</th>
              <th className="px-4 py-2.5">Company</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Booking plan</th>
              <th className="px-4 py-2.5 text-right">Clinics</th>
              <th className="px-4 py-2.5 text-right" title="Clinics that joined with this rep's referral code">Referred</th>
              <th className="px-4 py-2.5 text-right" title="Accepted clinic sponsorships">Sponsoring</th>
              <th className="px-4 py-2.5 text-right" title="Completed of all visits">Visits</th>
              <th className="px-4 py-2.5">Last sign-in</th>
              <th className="px-4 py-2.5">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/platform/reps/${r.id}`} className={LINK}>{r.name}</Link>
                  <div className="text-xs text-gray-500">{r.email}</div>
                </td>
                <td className="px-4 py-2.5 text-gray-700">
                  {r.company}
                  {r.territory && <div className="text-xs text-gray-500">{r.territory}</div>}
                </td>
                <td className="px-4 py-2.5"><RepStateBadge state={r.state} /></td>
                <td className="px-4 py-2.5 text-gray-700"><PlanText plan={r.plan} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.clinics}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.referred}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.sponsoring}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.visits.completed}/{r.visits.total}</td>
                <td className="px-4 py-2.5 text-gray-700">{ago(r.lastLogin)}</td>
                <td className="px-4 py-2.5 text-gray-700">{day(r.createdAt)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500">No reps match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {data.page} of {pages} · {data.total} reps</span>
          <span className="flex gap-3">
            {data.page > 1 && <Link className={LINK} href={href({ page: data.page - 1 })}>Previous</Link>}
            {data.page < pages && <Link className={LINK} href={href({ page: data.page + 1 })}>Next</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
