import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { REP_MONTHS, REP_SORTS, REP_STATES, REP_STATE_LABEL, loadPlatformReps, type RepSort, type RepState } from '@/lib/platform-reps';
import { CARD, FIELD, FOCUS_RING, H2, LINK, Initial, activityOf, ago, day } from '@/components/platform/shared';
import { PlanText, REP_STATE_COLOR, RepStateBadge } from '@/components/platform/RepBits';
import { ColumnChart } from '@/components/platform/charts';

export const dynamic = 'force-dynamic';

const monthShort = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function SortHead({ label, sorts, current, href }: { label: string; sorts: RepSort[]; current: RepSort; href: (s: RepSort) => string }) {
  const idx = sorts.indexOf(current);
  const next = sorts[idx === -1 ? 0 : (idx + 1) % sorts.length];
  const ascending = current === 'oldest' || current === 'name';
  const Icon = ascending ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2.5" aria-sort={idx === -1 ? undefined : ascending ? 'ascending' : 'descending'}>
      <Link href={href(next)} className={`inline-flex items-center gap-1 rounded hover:text-gray-900 ${FOCUS_RING} ${idx === -1 ? '' : 'text-gray-900'}`}>
        {label}
        {idx !== -1 && <Icon aria-hidden="true" className="size-3" />}
      </Link>
    </th>
  );
}

/** Completed of all visits, as a count and a thin bar. */
function VisitMeter({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="ml-auto w-20">
      <div className="text-right tabular-nums text-gray-700">
        {completed}<span className="text-gray-400">/{total}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-gray-100" aria-hidden="true">
        {total > 0 && completed > 0 && <div className="h-full rounded-full bg-brand-teal-dark" style={{ width: `${(completed / total) * 100}%` }} />}
      </div>
    </div>
  );
}

export default async function PlatformRepsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; page?: string; sort?: string }>;
}) {
  await requirePlatformPage();
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const state = (REP_STATES as string[]).includes(sp.state ?? '') ? (sp.state as RepState) : '';
  const sort: RepSort = (REP_SORTS as string[]).includes(sp.sort ?? '') ? (sp.sort as RepSort) : 'newest';
  const data = await loadPlatformReps({ q, state, page: Number(sp.page) || 1, sort });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const first = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = Math.min(data.total, data.page * data.pageSize);

  const href = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, state, sort, page: undefined as unknown, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === 'sort' && v === 'newest')) p.set(k, String(v));
    const s = p.toString();
    return `/platform/reps${s ? `?${s}` : ''}`;
  };
  const sortHref = (s: RepSort) => href({ sort: s });
  const total = data.counts.all;
  const recent = data.signupsByMonth.at(-1)?.count ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Medical reps</h1>
          <p className="mt-0.5 text-sm text-gray-500">Every registered medical representative, across all clinics.</p>
        </div>
        <form className="relative w-full sm:w-80" action="/platform/reps" role="search">
          <label className="sr-only" htmlFor="q">Search reps</label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <input id="q" name="q" type="text" inputMode="search" autoComplete="off" defaultValue={q} placeholder="Name, email, company, territory…" title="Search by name, email, company, territory or phone" className={`${FIELD} pl-9 pr-9`} />
          {state && <input type="hidden" name="state" value={state} />}
          {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
          {q && (
            <Link href={href({ q: undefined })} aria-label="Clear search" className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 ${FOCUS_RING}`}>
              <X className="size-4" />
            </Link>
          )}
        </form>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className={`${CARD} p-5 lg:col-span-3`} aria-labelledby="by-state">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="by-state" className={H2}>Reps by state</h2>
            <p className="text-sm text-gray-500">
              <span className="font-semibold tabular-nums text-gray-900">{total}</span> {q ? 'matching' : 'in all'}
            </p>
          </div>
          {total > 0 && (
            <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
              {REP_STATES.filter((s) => data.counts[s] > 0).map((s) => (
                <div
                  key={s}
                  className={`h-full first:rounded-l-full last:rounded-r-full ${state && state !== s ? 'opacity-30' : ''}`}
                  style={{ width: `${(data.counts[s] / total) * 100}%`, backgroundColor: REP_STATE_COLOR[s] }}
                  title={`${REP_STATE_LABEL[s]}: ${data.counts[s]}`}
                />
              ))}
            </div>
          )}
          <nav aria-label="Filter by state" className="mt-4 flex flex-wrap gap-1.5 text-sm">
            {(['', ...REP_STATES] as const).map((s) => {
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
                  {s && <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: REP_STATE_COLOR[s] }} />}
                  {s ? REP_STATE_LABEL[s] : 'All'}
                  <span className={`tabular-nums ${on ? 'text-slate-300' : 'text-gray-500'}`}>{data.counts[s || 'all']}</span>
                </Link>
              );
            })}
          </nav>
          {data.counts.awaiting > 0 && state !== 'awaiting' && (
            <p className="mt-4 text-xs text-gray-500">
              {data.counts.awaiting} registered but haven&rsquo;t paid the activation fee.{' '}
              <Link href={href({ state: 'awaiting' })} className={LINK}>See them</Link>
            </p>
          )}
        </section>

        <section className={`${CARD} p-5 lg:col-span-2`} aria-labelledby="rep-signups">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="rep-signups" className={H2}>New reps</h2>
            <p className="text-sm text-gray-500"><span className="font-semibold tabular-nums text-gray-900">{recent}</span> this month</p>
          </div>
          <div className="mt-3">
            <ColumnChart
              label={`Reps registered per month, last ${REP_MONTHS} months`}
              height={130}
              format={{ kind: 'count', unit: ['rep', 'reps'] }}
              points={data.signupsByMonth.map((r, i, all) => ({
                label: monthShort(r.month),
                full: i === all.length - 1 ? `${monthLong(r.month)} (so far)` : monthLong(r.month),
                value: r.count,
              }))}
            />
          </div>
        </section>
      </div>

      <div className={`${CARD} relative overflow-x-auto`}>
        <table className="w-full min-w-[900px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="border-b border-gray-200 bg-gray-50/60 text-left text-xs font-medium text-gray-500">
            <tr>
              <SortHead label="Rep" sorts={['name']} current={sort} href={sortHref} />
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">State</th>
              <th className="px-3 py-2.5">Booking plan</th>
              <th className="px-3 py-2.5" title="Linked clinics; referred = joined with this rep's code; sponsoring = accepted sponsorships">Clinics</th>
              <th className="px-3 py-2.5 text-right" title="Completed of all visits">Visits</th>
              <th className="px-3 py-2.5">Last sign-in</th>
              <SortHead label="Joined" sorts={['newest', 'oldest']} current={sort} href={sortHref} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((r) => {
              const act = activityOf(r.lastLogin);
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <Initial name={r.name} />
                      <div className="min-w-0">
                        <Link href={`/platform/reps/${r.id}`} className={`${LINK} block max-w-[200px] truncate`}>{r.name}</Link>
                        <div className="max-w-[200px] truncate text-xs text-gray-500">{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    <div className="max-w-[180px] truncate" title={r.company}>{r.company}</div>
                    {r.territory && <div className="max-w-[180px] truncate text-xs text-gray-500">{r.territory}</div>}
                  </td>
                  <td className="px-3 py-2.5"><RepStateBadge state={r.state} /></td>
                  <td className="px-3 py-2.5 text-gray-700"><PlanText plan={r.plan} /></td>
                  <td className="px-3 py-2.5">
                    <div className="tabular-nums text-gray-700">{r.clinics} linked</div>
                    <div className="text-xs tabular-nums text-gray-500">{r.referred} referred · {r.sponsoring} sponsored</div>
                  </td>
                  <td className="px-3 py-2.5"><VisitMeter completed={r.visits.completed} total={r.visits.total} /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className={`size-2 shrink-0 rounded-full ${act.tone}`} title={act.label} aria-hidden="true" />
                      {ago(r.lastLogin)}
                      <span className="sr-only">({act.label})</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{day(r.createdAt)}</td>
                </tr>
              );
            })}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Search aria-hidden="true" className="mx-auto size-7 text-gray-300" />
                  <p className="mt-2 text-gray-600">No reps match.</p>
                  {(q || state) && <Link href="/platform/reps" className={`${LINK} mt-1 inline-block text-sm`}>Clear filters</Link>}
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
