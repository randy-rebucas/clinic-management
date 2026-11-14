import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarX2,
  CheckCircle2,
  Hourglass,
  LifeBuoy,
  MessagesSquare,
  Minus,
  Repeat,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { ATTENTION_DAYS, loadPlatformOverview, type AttentionClinic } from '@/lib/platform-console';
import { LIFECYCLE_LABEL, type MonthRevenue, type TenantLifecycle } from '@/lib/platform-metrics';
import { BarRow, CARD, H2, LINK, LifecycleBadge, ago, money, pct, planLabel } from '@/components/platform/shared';
import { ColumnChart } from '@/components/platform/charts';

export const dynamic = 'force-dynamic';

const LIFECYCLE_ORDER: TenantLifecycle[] = ['paying', 'cancelling', 'trial', 'trial-ended', 'lapsed', 'suspended'];

const monthShort = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (m: string) => new Date(`${m}-15T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Change between two counts, as an arrow chip. Up is good for everything shown with it. */
function Delta({ now, before, suffix }: { now: number; before: number; suffix: string }) {
  if (before === 0 && now === 0) return null;
  const change = before === 0 ? null : (now - before) / before;
  const dir = now > before ? 'up' : now < before ? 'down' : 'flat';
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  const tone = dir === 'up' ? 'bg-emerald-50 text-emerald-700' : dir === 'down' ? 'bg-rose-50 text-rose-700' : 'bg-gray-100 text-gray-600';
  const text = change === null ? 'new' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`} title={suffix}>
      <Icon aria-hidden="true" className="size-3" />
      {text}
      <span className="sr-only"> {suffix}</span>
    </span>
  );
}

function Tile({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
    </div>
  );
}

function inDays(iso: string, now: number) {
  const d = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
  return d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
}

function AttentionRow({ icon: Icon, tone, label, count, href, clinics, now }: {
  icon: LucideIcon; tone: string; label: string; count: number; href: string; clinics?: AttentionClinic[]; now: number;
}) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <Link href={href} className="group flex items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="flex-1 text-sm text-gray-700 group-hover:text-gray-900">{label}</span>
        <span className="text-lg font-semibold tabular-nums text-gray-900">{count}</span>
        <ArrowRight aria-hidden="true" className="size-4 text-gray-300 group-hover:text-gray-500" />
      </Link>
      {clinics && clinics.length > 0 && (
        <ul className="mt-2 space-y-1 pl-11 text-xs">
          {clinics.slice(0, 3).map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <Link href={`/platform/clinics/${c.id}`} className={`${LINK} truncate`}>{c.name}</Link>
              <span className="shrink-0 text-gray-500">{inDays(c.expiresAt, now)}</span>
            </li>
          ))}
          {clinics.length > 3 && <li className="text-gray-500">and {clinics.length - 3} more</li>}
        </ul>
      )}
    </li>
  );
}

/** The currency most revenue came in, its monthly series, and totals in any others. */
function revenueSeries(revenue: MonthRevenue[]) {
  const totals = new Map<string, number>();
  for (const m of revenue) for (const [cur, v] of Object.entries(m.byCurrency)) totals.set(cur, (totals.get(cur) ?? 0) + v);
  const currencies = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const main = currencies[0] ?? null;
  return {
    main,
    values: revenue.map((m) => (main ? m.byCurrency[main] ?? 0 : 0)),
    others: currencies.slice(1).map((c) => ({ c, total: totals.get(c)! })),
  };
}

export default async function PlatformOverviewPage() {
  await requirePlatformPage();
  const { metrics: m, recentSignups, support, attention } = await loadPlatformOverview();
  const now = new Date(m.asOf).getTime();
  const life = m.tenants.byLifecycle;
  const rev = revenueSeries(m.revenue);
  const n = m.revenue.length;
  // The current month is partial, so the headline compares the last two full months.
  const lastFull = rev.values[n - 2] ?? 0;
  const priorFull = rev.values[n - 3] ?? 0;
  const lifeMax = Math.max(...LIFECYCLE_ORDER.map((l) => life[l]));
  const planMax = Math.max(...m.mrrByPlan.map((p) => p.mrr));
  const allClear = support.waiting + support.chatsUnread + attention.trialsEnding.length + attention.cancelling.length === 0;
  const series = <T,>(rows: T[], month: (r: T) => string, value: (r: T, i: number) => number) =>
    rows.map((r, i) => ({
      label: monthShort(month(r)),
      full: i === rows.length - 1 ? `${monthLong(month(r))} (so far)` : monthLong(month(r)),
      value: value(r, i),
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Overview</h1>
          <p className="mt-0.5 text-sm text-gray-500">{m.tenants.total} clinics on MyClinicSoft</p>
        </div>
        <p className="text-xs text-gray-500">As of {new Date(m.asOf).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile icon={Wallet} label="MRR" value={money(m.mrr, m.currency)} note={`${money(m.arr, m.currency)} a year, at list price`} />
        <Tile icon={BadgeCheck} label="Paying clinics" value={String(life.paying)} note={`${life.cancelling} cancelling`} />
        <Tile icon={Hourglass} label="In trial" value={String(life.trial)} note={`${life['trial-ended']} trials ended without paying`} />
        <Tile icon={UserMinus} label="Churn, 30 days" value={pct(m.churn.rate)} note={`${m.churn.churned} paid ${m.churn.churned === 1 ? 'plan' : 'plans'} ended without renewal`} />
        <Tile icon={Repeat} label="Trial → paid" value={pct(m.trialConversion.rate)} note={`${m.trialConversion.converted} of ${m.trialConversion.cohort} who signed up 30–120 days ago`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} p-5 lg:col-span-2`} aria-labelledby="rev">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="rev" className={H2}>Collected revenue</h2>
              <p className="text-xs text-gray-500">Completed payments by month, as recorded by PayMongo.</p>
            </div>
            {rev.main && n >= 3 && (
              <div className="text-right">
                <p className="flex items-center justify-end gap-2 text-lg font-semibold tabular-nums text-gray-900">
                  {money(lastFull, rev.main)}
                  <Delta now={lastFull} before={priorFull} suffix={`vs ${monthLong(m.revenue[n - 3].month)}`} />
                </p>
                <p className="text-xs text-gray-500">in {monthLong(m.revenue[n - 2].month)}</p>
              </div>
            )}
          </div>
          {rev.main ? (
            <div className="mt-4">
              <ColumnChart
                label={`Collected revenue in ${rev.main} per month`}
                format={{ kind: 'money', currency: rev.main }}
                points={series(m.revenue, (r) => r.month, (_, i) => rev.values[i])}
              />
              <p className="mt-2 text-xs text-gray-500">
                {money(rev.values.reduce((a, b) => a + b, 0), rev.main)} over six months.
                {rev.others.map(({ c, total }) => ` Also ${money(total, c)} in ${c}.`).join('')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-14 text-center">
              <Wallet aria-hidden="true" className="size-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">No payments in the last six months.</p>
            </div>
          )}
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="attention">
          <h2 id="attention" className={H2}>Needs attention</h2>
          <p className="mb-4 text-xs text-gray-500">Waiting on us, or ending in the next {ATTENTION_DAYS} days.</p>
          {allClear ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 aria-hidden="true" className="size-8 text-emerald-600" />
              <p className="mt-2 text-sm font-medium text-gray-900">All clear</p>
              <p className="text-xs text-gray-500">Nothing waiting and nothing ending this week.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              <AttentionRow now={now} icon={LifeBuoy} tone="bg-amber-50 text-amber-700" label="Support requests waiting" count={support.waiting} href="/platform/support" />
              <AttentionRow now={now} icon={MessagesSquare} tone="bg-amber-50 text-amber-700" label="Chats with unread messages" count={support.chatsUnread} href="/platform/chat" />
              <AttentionRow now={now} icon={Hourglass} tone="bg-brand-teal-light text-brand-teal-deep" label="Trials ending" count={attention.trialsEnding.length} href="/platform/clinics?state=trial" clinics={attention.trialsEnding} />
              <AttentionRow now={now} icon={CalendarX2} tone="bg-rose-50 text-rose-700" label="Cancelled plans ending" count={attention.cancelling.length} href="/platform/clinics?state=cancelling" clinics={attention.cancelling} />
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} p-5`} aria-labelledby="signup-chart">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="signup-chart" className={H2}>Sign-ups</h2>
              <p className="text-xs text-gray-500">New clinics per month.</p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-2 text-lg font-semibold tabular-nums text-gray-900">
                {m.signups.last30}
                <Delta now={m.signups.last30} before={m.signups.previous30} suffix="vs the 30 days before" />
              </p>
              <p className="text-xs text-gray-500">in 30 days ({m.signups.previous30} before)</p>
            </div>
          </div>
          <div className="mt-4">
            <ColumnChart
              label="New clinics per month"
              height={220}
              format={{ kind: 'count', unit: ['clinic', 'clinics'] }}
              points={series(m.signupsByMonth, (r) => r.month, (r) => r.count)}
            />
          </div>
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="states">
          <h2 id="states" className={H2}>Clinics by state</h2>
          <p className="mb-4 text-xs text-gray-500">Where each clinic stands commercially today.</p>
          <ul className="space-y-3">
            {LIFECYCLE_ORDER.map((l) => (
              <BarRow key={l} label={LIFECYCLE_LABEL[l]} value={life[l]} max={lifeMax} right={String(life[l])} href={`/platform/clinics?state=${l}`} />
            ))}
          </ul>
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="plans">
          <h2 id="plans" className={H2}>MRR by plan</h2>
          <p className="mb-4 text-xs text-gray-500">Paying clinics at list price.</p>
          <ul className="space-y-3">
            {m.mrrByPlan.map((p) => (
              <BarRow
                key={p.plan}
                label={`${planLabel(p.plan)} · ${p.clinics} ${p.clinics === 1 ? 'clinic' : 'clinics'}`}
                value={p.mrr}
                max={planMax}
                right={`${money(p.mrr, m.currency)}${m.mrr > 0 ? ` · ${pct(p.mrr / m.mrr)}` : ''}`}
              />
            ))}
          </ul>
        </section>
      </div>

      <section className={CARD} aria-labelledby="signups">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 id="signups" className={H2}>Latest sign-ups</h2>
          <Link href="/platform/clinics" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
            All clinics <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
        <ul className="mt-3 divide-y divide-gray-100">
          {recentSignups.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold uppercase text-gray-600">
                {t.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/platform/clinics/${t.id}`} className={`${LINK} block truncate`}>{t.name}</Link>
                <span className="block truncate text-xs text-gray-500">{t.subdomain}</span>
              </div>
              <LifecycleBadge lifecycle={t.lifecycle} />
              <span className="hidden w-20 text-right text-xs text-gray-500 sm:inline">{ago(t.createdAt)}</span>
            </li>
          ))}
          {recentSignups.length === 0 && <li className="px-5 py-6 text-sm text-gray-500">No clinics yet.</li>}
        </ul>
      </section>

      <p className="text-xs text-gray-500">
        MRR counts each paying clinic at its plan&rsquo;s list price in {m.currency} (yearly plans ÷ 12) and leaves out clinics that cancelled.
        Churn is paid plans whose period ended in the last 30 days without renewal, over paying clinics plus those.
      </p>
    </div>
  );
}
