import Link from 'next/link';
import { ArrowLeft, CircleDashed, Globe, Ticket, Wallet } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { VOUCHER_MONTHS } from '@/lib/emcr/vouchers';
import { ONLINE_LIST_LIMIT, loadOnlinePurchases, loadOnlineVoucherSummary, type OnlineStatus } from '@/lib/emcr/online-vouchers';
import OnlineVoucherActions from '@/components/platform/OnlineVoucherActions';
import { ColumnChart } from '@/components/platform/charts';
import { CARD, FOCUS_RING, H2, LINK, ago, day, php } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');
const monthShort = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const FILTERS: Array<{ key: '' | OnlineStatus; label: string }> = [
  { key: '', label: 'All' },
  { key: 'unused', label: 'Paid, unused' },
  { key: 'redeemed', label: 'Redeemed' },
  { key: 'pending', label: 'Not paid' },
];

const STATUS_BADGE: Record<OnlineStatus, { label: string; cls: string }> = {
  pending: { label: 'Not paid', cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  unused: { label: 'Paid, unused', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  redeemed: { label: 'Redeemed', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
};

function filterHref(status: string, q: string) {
  const sp = new URLSearchParams();
  if (status) sp.set('status', status);
  if (q) sp.set('q', q);
  const s = sp.toString();
  return s ? `/platform/vouchers/online?${s}` : '/platform/vouchers/online';
}

export default async function PlatformOnlineVouchersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requirePlatformPage();
  const sp = await searchParams;
  const status = FILTERS.find((f) => f.key && f.key === sp.status)?.key ?? '';
  const q = (sp.q ?? '').trim().slice(0, 100);
  const [summary, rows] = await Promise.all([loadOnlineVoucherSummary(), loadOnlinePurchases({ q, status })]);
  const revenue12 = summary.byMonth.reduce((s, m) => s + m.revenue, 0);
  const redeemRate = summary.sold ? Math.round((summary.redeemed / summary.sold) * 100) : null;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/platform/vouchers" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
          <ArrowLeft aria-hidden="true" className="size-4" /> eMCR vouchers
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">Online vouchers</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Activation codes patients bought at <span className="font-mono">/voucher</span> through PayMongo. Viewing a code is logged.
        </p>
      </div>

      <dl className={`${CARD} grid grid-cols-2 divide-gray-100 sm:grid-cols-4 sm:divide-x`}>
        {[
          { icon: Wallet, label: 'Revenue', value: php(summary.revenue), note: 'Paid through PayMongo' },
          { icon: Ticket, label: 'Codes sold', value: n(summary.sold), note: redeemRate === null ? 'None yet' : `${n(summary.redeemed)} redeemed (${redeemRate}%)` },
          { icon: Globe, label: 'Paid, unused', value: n(summary.unused), note: 'Bought but not entered in the app' },
          { icon: CircleDashed, label: 'Not paid, last 7 days', value: n(summary.pendingRecent), note: 'Abandoned or still at checkout' },
        ].map((x) => (
          <div key={x.label} className="px-4 py-3">
            <dt className="flex items-center gap-1.5 text-xs text-gray-500">
              <x.icon aria-hidden="true" className="size-3.5 text-brand-teal-deep" /> {x.label}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{x.value}</dd>
            <dd className="text-xs text-gray-500">{x.note}</dd>
          </div>
        ))}
      </dl>

      <section className={`${CARD} p-4`} aria-labelledby="online-by-month">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="online-by-month" className={H2}>Online sales per month</h2>
          <span className="text-xs tabular-nums text-gray-500">{php(revenue12)} in {VOUCHER_MONTHS} months</span>
        </div>
        <div className="mt-3">
          <ColumnChart
            label="Revenue from online eMCR vouchers, per month"
            height={170}
            format={{ kind: 'money', currency: 'PHP' }}
            points={summary.byMonth.map((m) => ({ label: monthShort(m.month), full: monthLong(m.month), value: m.revenue }))}
          />
        </div>
      </section>

      <section className={CARD} aria-labelledby="purchases">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <h2 id="purchases" className={H2}>Purchases</h2>
          <form action="/platform/vouchers/online" className="flex items-center gap-2" role="search">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="online-q" className="sr-only">Search purchases</label>
            <input
              id="online-q"
              name="q"
              defaultValue={q}
              placeholder="Email, pay_… id, or last 4 of code"
              className={`w-64 rounded-md border border-gray-300 px-3 py-1.5 text-sm ${FOCUS_RING}`}
            />
            <button type="submit" className={`rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Search
            </button>
          </form>
        </div>
        <nav aria-label="Filter purchases by status" className="flex flex-wrap gap-1.5 px-4 pt-3 text-sm">
          {FILTERS.map((f) => {
            const on = status === f.key;
            return (
              <Link
                key={f.key || 'all'}
                href={filterHref(f.key, q)}
                aria-current={on ? 'page' : undefined}
                scroll={false}
                className={`inline-flex items-center rounded-full px-3 py-0.5 ring-1 ring-inset ${FOCUS_RING} ${
                  on ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-gray-400'
                }`}
              >
                {f.label}
              </Link>
            );
          })}
          {q && (
            <Link href={filterHref(status, '')} className={`${LINK} ml-1 self-center text-xs`}>
              Clear search
            </Link>
          )}
        </nav>

        {rows.length ? (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="border-y border-gray-100 bg-gray-50/60 text-left text-xs text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Buyer</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-3 py-2 font-medium">Payment</th>
                  <th scope="col" className="px-3 py-2 font-medium">Code</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const badge = STATUS_BADGE[r.status];
                  return (
                    <tr key={r.id} className="align-top hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="max-w-[240px] truncate text-gray-900">{r.email}</div>
                        <div className="text-xs text-gray-500">Started {day(r.createdAt)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.cls}`}>{badge.label}</span>
                        {r.status === 'redeemed' && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {r.redeemedAt ? ago(r.redeemedAt) : ''}
                            {r.redeemedByPhone ? ` · ${r.redeemedByPhone}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{php(r.paidAmount ?? r.amount)}</td>
                      <td className="px-3 py-2.5">
                        {r.paidAt ? (
                          <>
                            <div className="font-mono text-xs text-gray-700">{r.paymentId ?? '—'}</div>
                            <div className="text-xs text-gray-500">Paid {day(r.paidAt)}</div>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.last4 ? <span className="font-mono text-xs text-gray-700">••••-••••-{r.last4}</span> : <span className="text-xs text-gray-400">—</span>}
                        {r.status !== 'pending' && (
                          <div className={`text-xs ${r.emailedAt ? 'text-gray-500' : 'font-medium text-amber-700'}`}>
                            {r.emailedAt ? `Emailed ${ago(r.emailedAt)}` : 'Not emailed'}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <OnlineVoucherActions id={r.id} status={r.status} email={r.email} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-gray-500">
            {q || status ? 'No purchases match.' : 'No online purchases yet.'}
          </p>
        )}
        {rows.length >= ONLINE_LIST_LIMIT && (
          <p className="px-4 py-3 text-xs text-gray-500">Showing the latest {ONLINE_LIST_LIMIT}. Search by email to find older ones.</p>
        )}
        <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">Checkouts never paid are removed after 30 days.</p>
      </section>
    </div>
  );
}
