import Link from 'next/link';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadPlatformTenants } from '@/lib/platform-console';
import { LIFECYCLE_LABEL, type TenantLifecycle } from '@/lib/platform-metrics';
import { CARD, LINK, LifecycleBadge, ago, day, planLabel, usd } from '@/components/platform/shared';
import { FIELD, FOCUS_RING } from '@/components/appointments/shared';

export const dynamic = 'force-dynamic';

const STATES: TenantLifecycle[] = ['paying', 'cancelling', 'trial', 'trial-ended', 'lapsed', 'suspended'];

export default async function PlatformClinicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string }>;
}) {
  await requirePlatformPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const state = (STATES as string[]).includes(sp.state ?? '') ? (sp.state as TenantLifecycle) : '';
  const data = await loadPlatformTenants({ q, lifecycle: state, page: Number(sp.page) || 1 });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, state, page: undefined as unknown, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return `/platform/clinics${s ? `?${s}` : ''}`;
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900">Clinics</h1>

      <form className="flex flex-wrap gap-2" action="/platform/clinics">
        <label className="sr-only" htmlFor="q">Search clinics</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, subdomain or email" className={`${FIELD} max-w-xs`} />
        {state && <input type="hidden" name="state" value={state} />}
        <button className={`rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>Search</button>
      </form>

      <nav aria-label="Filter by state" className="flex flex-wrap gap-1.5 text-sm">
        {(['', ...STATES] as const).map((s) => (
          <Link
            key={s || 'all'}
            href={href({ state: s })}
            aria-current={state === s ? 'page' : undefined}
            className={`rounded-full px-3 py-1 ring-1 ring-inset ${FOCUS_RING} ${
              state === s ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-300 hover:ring-gray-500'
            }`}
          >
            {s ? LIFECYCLE_LABEL[s] : 'All'} <span className="tabular-nums opacity-70">{data.counts[s || 'all']}</span>
          </Link>
        ))}
      </nav>

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Clinic</th>
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5 text-right">MRR</th>
              <th className="px-4 py-2.5">Period ends</th>
              <th className="px-4 py-2.5 text-right">Staff</th>
              <th className="px-4 py-2.5">Last staff sign-in</th>
              <th className="px-4 py-2.5">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link href={`/platform/clinics/${r.id}`} className={LINK}>{r.name}</Link>
                  <div className="text-xs text-gray-500">{r.subdomain}</div>
                </td>
                <td className="px-4 py-2.5"><LifecycleBadge lifecycle={r.lifecycle} /></td>
                <td className="px-4 py-2.5 text-gray-700">{planLabel(r.plan)}{r.billingCycle === 'yearly' && r.plan !== 'trial' ? ' (yearly)' : ''}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.mrr ? usd(r.mrr) : '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{day(r.expiresAt)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{r.staff}</td>
                <td className="px-4 py-2.5 text-gray-700">{ago(r.lastStaffLogin)}</td>
                <td className="px-4 py-2.5 text-gray-700">{day(r.createdAt)}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No clinics match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {data.page} of {pages} · {data.total} clinics</span>
          <span className="flex gap-3">
            {data.page > 1 && <Link className={LINK} href={href({ page: data.page - 1 })}>Previous</Link>}
            {data.page < pages && <Link className={LINK} href={href({ page: data.page + 1 })}>Next</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
