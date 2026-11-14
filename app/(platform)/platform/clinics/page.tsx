import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Users, X } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { CLINIC_SORTS, loadPlatformTenants, type ClinicSort } from '@/lib/platform-console';
import { LIFECYCLE_LABEL, type TenantLifecycle } from '@/lib/platform-metrics';
import {
  CARD,
  LIFECYCLE_COLOR,
  LINK,
  Initial,
  LifecycleBadge,
  activityOf,
  ago,
  day,
  money,
  planLabel,
  relDays,
} from '@/components/platform/shared';
import { FIELD, FOCUS_RING } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const STATES: TenantLifecycle[] = ['paying', 'cancelling', 'trial', 'trial-ended', 'lapsed', 'suspended'];

/** A sortable column header. `sorts` are the orders it cycles through; the first is applied first. */
function SortHead({ label, sorts, current, href, align }: {
  label: string; sorts: ClinicSort[]; current: ClinicSort; href: (sort: ClinicSort) => string; align?: 'right';
}) {
  const activeIdx = sorts.indexOf(current);
  const next = sorts[activeIdx === -1 ? 0 : (activeIdx + 1) % sorts.length];
  const ascending = current === 'oldest' || current === 'name' || current === 'ends';
  const Icon = ascending ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-2.5 ${align === 'right' ? 'text-right' : ''}`} aria-sort={activeIdx === -1 ? undefined : ascending ? 'ascending' : 'descending'}>
      <Link href={href(next)} className={`inline-flex items-center gap-1 rounded hover:text-gray-900 ${FOCUS_RING} ${activeIdx === -1 ? '' : 'text-gray-900'}`}>
        {label}
        {activeIdx !== -1 && <Icon aria-hidden="true" className="size-3" />}
      </Link>
    </th>
  );
}

export default async function PlatformClinicsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string; sort?: string }>;
}) {
  await requirePlatformPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const state = (STATES as string[]).includes(sp.state ?? '') ? (sp.state as TenantLifecycle) : '';
  const sort: ClinicSort = (CLINIC_SORTS as string[]).includes(sp.sort ?? '') ? (sp.sort as ClinicSort) : 'newest';
  const data = await loadPlatformTenants({ q, lifecycle: state, page: Number(sp.page) || 1, sort });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const first = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = Math.min(data.total, data.page * data.pageSize);

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, state, sort: sort === 'newest' ? undefined : sort, page: undefined as unknown, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'sort' && v === 'newest')) p.set(k, String(v));
    const s = p.toString();
    return `/platform/clinics${s ? `?${s}` : ''}`;
  };

  const sortHref = (next: ClinicSort) => href({ sort: next });
  const total = data.counts.all;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Clinics</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {data.total} {data.total === 1 ? 'clinic' : 'clinics'}
            {state ? ` ${LIFECYCLE_LABEL[state].toLowerCase()}` : ''}
            {q ? ` matching “${q}”` : ''}
            {data.mrrTotal > 0 ? ` · ${money(data.mrrTotal, data.currency)} MRR` : ''}
          </p>
        </div>
        <form className="relative w-full sm:w-72" action="/platform/clinics" role="search">
          <label className="sr-only" htmlFor="q">Search clinics</label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input id="q" name="q" type="text" inputMode="search" autoComplete="off" defaultValue={q} placeholder="Name, subdomain or email" className={`${FIELD} pl-9 pr-9`} />
          {state && <input type="hidden" name="state" value={state} />}
          {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
          {q && (
            <Link href={href({ q: undefined })} aria-label="Clear search" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 ${FOCUS_RING}`}>
              <X className="size-4" />
            </Link>
          )}
        </form>
      </div>

      <section className={`${CARD} p-4`} aria-label="Clinics by state">
        {total > 0 && (
          <div className="mb-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {STATES.filter((s) => data.counts[s] > 0).map((s) => (
              <div
                key={s}
                className={`h-full first:rounded-l-full last:rounded-r-full ${state && state !== s ? 'opacity-30' : ''}`}
                style={{ width: `${(data.counts[s] / total) * 100}%`, backgroundColor: LIFECYCLE_COLOR[s] }}
                title={`${LIFECYCLE_LABEL[s]}: ${data.counts[s]}`}
              />
            ))}
          </div>
        )}
        <nav aria-label="Filter by state" className="flex flex-wrap gap-1.5 text-sm">
          {(['', ...STATES] as const).map((s) => {
            const on = state === s;
            return (
              <Link
                key={s || 'all'}
                href={href({ state: s })}
                aria-current={on ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-inset ${FOCUS_RING} ${
                  on ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-gray-400'
                }`}
              >
                {s && <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: LIFECYCLE_COLOR[s] }} />}
                {s ? LIFECYCLE_LABEL[s] : 'All'}
                <span className={`tabular-nums ${on ? 'text-slate-300' : 'text-gray-500'}`}>{data.counts[s || 'all']}</span>
              </Link>
            );
          })}
        </nav>
      </section>

      <div className={`${CARD} relative overflow-x-auto`}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50/60 text-left text-xs font-medium text-gray-500">
            <tr>
              <SortHead label="Clinic" sorts={['name']} current={sort} href={sortHref} />
              <th className="px-4 py-2.5">State</th>
              <th className="px-4 py-2.5">Plan</th>
              <SortHead label="MRR" sorts={['mrr']} current={sort} href={sortHref} align="right" />
              <SortHead label="Period ends" sorts={['ends']} current={sort} href={sortHref} />
              <th className="px-4 py-2.5">Staff activity</th>
              <SortHead label="Joined" sorts={['newest', 'oldest']} current={sort} href={sortHref} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((r) => {
              const ends = relDays(r.expiresAt);
              const act = activityOf(r.lastStaffLogin);
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Initial name={r.name} />
                      <div className="min-w-0">
                        <Link href={`/platform/clinics/${r.id}`} className={`${LINK} block max-w-[260px] truncate`}>{r.name}</Link>
                        <div className="text-xs text-gray-500">{r.subdomain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><LifecycleBadge lifecycle={r.lifecycle} /></td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {planLabel(r.plan)}
                    {r.billingCycle === 'yearly' && r.plan !== 'trial' && <span className="ml-1 text-xs text-gray-500">yearly</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{r.mrr ? money(r.mrr, data.currency) : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-gray-700">{day(r.expiresAt)}</div>
                    {ends && (
                      <div className={`text-xs ${ends.soon && r.lifecycle !== 'trial-ended' ? 'font-medium text-amber-700' : 'text-gray-500'}`}>{ends.text}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className={`size-2 shrink-0 rounded-full ${act.tone}`} title={act.label} aria-hidden="true" />
                      <span>{ago(r.lastStaffLogin)}</span>
                      <span className="sr-only">({act.label})</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <Users aria-hidden="true" className="size-3" />
                      {r.staff} active staff
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">
                    <div>{day(r.createdAt)}</div>
                    {Date.parse(r.createdAt) > Date.parse(data.asOf) - 30 * 86_400_000 && <div className="text-xs text-gray-500">{ago(r.createdAt)}</div>}
                  </td>
                </tr>
              );
            })}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Search aria-hidden="true" className="mx-auto size-7 text-gray-300" />
                  <p className="mt-2 text-gray-600">No clinics match.</p>
                  {(q || state) && <Link href="/platform/clinics" className={`${LINK} mt-1 inline-block text-sm`}>Clear filters</Link>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.total > 0 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm text-gray-600">
          <span className="tabular-nums">{first}–{last} of {data.total}</span>
          {pages > 1 && (
            <span className="flex items-center gap-1">
              {data.page > 1 ? (
                <Link className={`inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 hover:border-gray-400 ${FOCUS_RING}`} href={href({ page: data.page - 1 })}>
                  <ChevronLeft aria-hidden="true" className="size-4" /> Previous
                </Link>
              ) : null}
              <span className="px-2 tabular-nums">Page {data.page} of {pages}</span>
              {data.page < pages ? (
                <Link className={`inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 hover:border-gray-400 ${FOCUS_RING}`} href={href({ page: data.page + 1 })}>
                  Next <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
