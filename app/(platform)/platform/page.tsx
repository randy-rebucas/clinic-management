import Link from 'next/link';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadPlatformOverview } from '@/lib/platform-console';
import { LIFECYCLE_LABEL, type MonthRevenue, type TenantLifecycle } from '@/lib/platform-metrics';
import { CARD, H2, LINK, LifecycleBadge, ago, money, pct, planLabel } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
    </div>
  );
}

const monthLabel = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/** Collected revenue per month in the currency most of it came in; the rest listed below. */
function RevenueChart({ revenue }: { revenue: MonthRevenue[] }) {
  const totals = new Map<string, number>();
  for (const m of revenue) for (const [cur, v] of Object.entries(m.byCurrency)) totals.set(cur, (totals.get(cur) ?? 0) + v);
  const currencies = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const main = currencies[0];
  if (!main) return <p className="py-10 text-center text-sm text-gray-500">No payments in the last six months.</p>;

  const values = revenue.map((m) => m.byCurrency[main] ?? 0);
  const max = Math.max(...values, 1);
  const W = 480, H = 160, gap = 16, barW = (W - gap * (values.length - 1)) / values.length;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label={`Collected revenue in ${main} per month`}>
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 2 : 0, (v / max) * H);
          const x = i * (barW + gap);
          return (
            <g key={revenue[i].month}>
              <rect x={x} y={H - h} width={barW} height={h} rx={3} fill="#0E9594">
                <title>{`${monthLabel(revenue[i].month)}: ${money(v, main)}`}</title>
              </rect>
              <text x={x + barW / 2} y={H + 16} textAnchor="middle" className="fill-gray-500 text-[11px]">{monthLabel(revenue[i].month)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-xs text-gray-500">
        In {main}: {money(values.reduce((a, b) => a + b, 0), main)} over six months.
        {currencies.slice(1).map((c) => ` Also ${money(totals.get(c)!, c)} in ${c}.`).join('')}
      </figcaption>
    </figure>
  );
}

const LIFECYCLE_ORDER: TenantLifecycle[] = ['paying', 'cancelling', 'trial', 'trial-ended', 'lapsed', 'suspended'];

export default async function PlatformOverviewPage() {
  await requirePlatformPage();
  const { metrics: m, recentSignups, support } = await loadPlatformOverview();
  const life = m.tenants.byLifecycle;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
        <p className="text-xs text-gray-500">As of {new Date(m.asOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="MRR" value={money(m.mrr, m.currency)} note={`${money(m.arr, m.currency)} a year, at list price`} />
        <Tile label="Paying clinics" value={String(life.paying)} note={`${life.cancelling} cancelling, ${m.tenants.total} clinics in all`} />
        <Tile label="In trial" value={String(life.trial)} note={`${m.signups.last30} sign-ups in 30 days (${m.signups.previous30} the 30 before)`} />
        <Tile label="Churn, 30 days" value={pct(m.churn.rate)} note={`${m.churn.churned} paid ${m.churn.churned === 1 ? 'plan' : 'plans'} ended without renewal`} />
        <Tile label="Trial → paid" value={pct(m.trialConversion.rate)} note={`${m.trialConversion.converted} of ${m.trialConversion.cohort} who signed up 30–120 days ago`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} p-5 lg:col-span-2`} aria-labelledby="rev">
          <h2 id="rev" className={H2}>Collected revenue</h2>
          <p className="mb-4 text-xs text-gray-500">Completed payments by month, as recorded by PayMongo and PayPal.</p>
          <RevenueChart revenue={m.revenue} />
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="plans">
          <h2 id="plans" className={H2}>MRR by plan</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {m.mrrByPlan.map((p) => (
                <tr key={p.plan} className="border-t border-gray-100 first:border-0">
                  <td className="py-2 text-gray-700">{planLabel(p.plan)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{p.clinics}</td>
                  <td className="py-2 text-right font-medium tabular-nums text-gray-900">{money(p.mrr, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className={`${H2} mt-6`}>Clinics by state</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {LIFECYCLE_ORDER.map((l) => (
              <li key={l} className="flex justify-between">
                <Link href={`/platform/clinics?state=${l}`} className={LINK}>{LIFECYCLE_LABEL[l]}</Link>
                <span className="tabular-nums text-gray-700">{life[l]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`} aria-labelledby="signups">
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 id="signups" className={H2}>Latest sign-ups</h2>
            <Link href="/platform/clinics" className={`${LINK} text-sm`}>All clinics</Link>
          </div>
          <ul className="mt-3 divide-y divide-gray-100">
            {recentSignups.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Link href={`/platform/clinics/${t.id}`} className={`${LINK} min-w-0 flex-1 truncate`}>{t.name}</Link>
                <span className="hidden text-gray-500 sm:inline">{t.subdomain}</span>
                <LifecycleBadge lifecycle={t.lifecycle} />
                <span className="w-20 text-right text-xs text-gray-500">{ago(t.createdAt)}</span>
              </li>
            ))}
            {recentSignups.length === 0 && <li className="px-5 py-6 text-sm text-gray-500">No clinics yet.</li>}
          </ul>
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="support">
          <h2 id="support" className={H2}>Support</h2>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-gray-900">{support.waiting}</p>
          <p className="text-sm text-gray-600">waiting on us, of {support.open} open</p>
          <Link href="/platform/support" className={`${LINK} mt-4 inline-block text-sm`}>Open the queue</Link>
        </section>
      </div>

      <p className="text-xs text-gray-500">
        MRR counts each paying clinic at its plan&rsquo;s list price in {m.currency} (yearly plans ÷ 12) and leaves out clinics that cancelled.
        Churn is paid plans whose period ended in the last 30 days without renewal, over paying clinics plus those.
      </p>
    </div>
  );
}
