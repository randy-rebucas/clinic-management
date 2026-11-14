import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { BadgeCheck, ReceiptText, Smartphone, Ticket, Wallet } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { VOUCHER_MONTHS, loadVoucherOverview, type VoucherBatchRow } from '@/lib/emcr/vouchers';
import { getPlatformFees } from '@/lib/platform-config';
import NewVoucherBatchForm from '@/components/platform/NewVoucherBatchForm';
import EmcrAccountLookup from '@/components/platform/EmcrAccountLookup';
import { ColumnChart } from '@/components/platform/charts';
import { BatchStatusBadge, CARD, FOCUS_RING, H2, LINK, day, php } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');
const DAY_MS = 86_400_000;
/** Unpaid batches older than this get flagged. */
const UNPAID_FLAG_DAYS = 14;

const STATUS_FILTERS: Array<{ key: '' | VoucherBatchRow['status']; label: string }> = [
  { key: '', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
];

const monthShort = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Stat({ icon: Icon, label, value, children }: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {children && <div className="mt-1 text-xs text-gray-500">{children}</div>}
    </div>
  );
}

/** "12 of 40" over a thin bar: how much of a stock has been used. */
function Meter({ value, of }: { value: number; of: number }) {
  const w = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  return (
    <div className="min-w-[96px]">
      <div className="text-right tabular-nums text-gray-700">
        {n(value)}<span className="text-gray-400"> / {n(of)}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100" aria-hidden="true">
        {value > 0 && <div className="h-full rounded-full bg-brand-teal-dark" style={{ width: `${Math.max(w, 3)}%` }} />}
      </div>
    </div>
  );
}

export default async function PlatformVouchersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePlatformPage();
  const sp = await searchParams;
  const [data, fees] = await Promise.all([loadVoucherOverview(), getPlatformFees()]);
  const { batches, totals: t, byClinic, clinics, byMonth, unpaid } = data;
  const status = STATUS_FILTERS.find((f) => f.key && f.key === sp.status)?.key ?? '';
  const shown = status ? batches.filter((b) => b.status === status) : batches;
  const statusCount = (key: string) => (key ? batches.filter((b) => b.status === key).length : batches.length);
  const asOf = Date.parse(data.asOf);
  const oldestUnpaidDays = unpaid.oldestAt ? Math.floor((asOf - Date.parse(unpaid.oldestAt)) / DAY_MS) : null;
  const redeemRate = t.codesSold ? Math.round((t.codesRedeemed / t.codesSold) * 100) : null;
  const cash12 = byMonth.reduce((s, m) => s + m.cashReceived, 0);
  const redeemed12 = byMonth.reduce((s, m) => s + m.redeemed, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">eMCR vouchers</h1>
        <p className="mt-0.5 text-sm text-gray-500">Activation codes clinics buy prepaid and sell to patients at the counter.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Wallet} label="Cash received" value={php(t.cashReceived)}>From clinics, for paid batches</Stat>
        <Stat icon={ReceiptText} label="Outstanding" value={php(t.cashOutstanding)}>
          {unpaid.batches === 0 ? (
            'No unpaid batches'
          ) : (
            <>
              {unpaid.batches} unpaid {unpaid.batches === 1 ? 'batch' : 'batches'}
              {oldestUnpaidDays !== null && (
                <span className={oldestUnpaidDays > UNPAID_FLAG_DAYS ? 'font-medium text-amber-700' : ''}>
                  {' · '}oldest {oldestUnpaidDays === 0 ? 'today' : `${oldestUnpaidDays} ${oldestUnpaidDays === 1 ? 'day' : 'days'}`}
                </span>
              )}
            </>
          )}
        </Stat>
        <Stat icon={Ticket} label="Codes sold" value={n(t.codesSold)}>
          {redeemRate === null ? 'In paid batches, less voided codes' : `${n(t.codesRedeemed)} redeemed (${redeemRate}%)`}
        </Stat>
        <Stat icon={Smartphone} label="Active eMCR accounts" value={n(t.activeAccounts)}>Not yet expired</Stat>
      </div>

      <dl className={`${CARD} grid grid-cols-2 divide-gray-100 sm:grid-cols-4 sm:divide-x`}>
        {[
          { label: 'Unredeemed stock', value: n(t.unredeemedPaid), note: 'Paid codes still at clinics' },
          { label: 'Redeemed', value: n(t.codesRedeemed), note: 'Activated by patients' },
          { label: 'Patient spend', value: php(t.patientSpend), note: 'Face value of redeemed codes' },
          { label: 'Clinic commission', value: php(t.clinicCommission), note: 'Clinics’ margin on redeemed codes' },
        ].map((x) => (
          <div key={x.label} className="px-4 py-3">
            <dt className="text-xs text-gray-500">{x.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{x.value}</dd>
            <dd className="text-xs text-gray-500">{x.note}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={`${CARD} p-4`} aria-labelledby="cash-by-month">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="cash-by-month" className={H2}>Cash received per month</h2>
            <span className="text-xs tabular-nums text-gray-500">{php(cash12)} in {VOUCHER_MONTHS} months</span>
          </div>
          <div className="mt-3">
            <ColumnChart
              label="Cash received from clinics for voucher batches, per month"
              height={170}
              format={{ kind: 'money', currency: 'PHP' }}
              points={byMonth.map((m) => ({ label: monthShort(m.month), full: monthLong(m.month), value: m.cashReceived }))}
            />
          </div>
        </section>
        <section className={`${CARD} p-4`} aria-labelledby="redeemed-by-month">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="redeemed-by-month" className={H2}>Codes redeemed per month</h2>
            <span className="text-xs tabular-nums text-gray-500">{n(redeemed12)} in {VOUCHER_MONTHS} months</span>
          </div>
          <div className="mt-3">
            <ColumnChart
              label="Voucher codes redeemed by patients, per month"
              height={170}
              format={{ kind: 'count', unit: ['code', 'codes'] }}
              points={byMonth.map((m) => ({ label: monthShort(m.month), full: monthLong(m.month), value: m.redeemed }))}
            />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <section className={CARD} aria-labelledby="by-clinic">
            <div className="px-4 pt-4">
              <h2 id="by-clinic" className={H2}>By clinic</h2>
              <p className="text-xs text-gray-500">Redeemed shows how much of each clinic’s paid stock patients have used.</p>
            </div>
            {byClinic.length ? (
              <div className="relative mt-3 overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                  <thead className="border-y border-gray-100 bg-gray-50/60 text-left text-xs text-gray-500">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Clinic</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Redeemed / paid</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">In stock</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Received</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {byClinic.map((c) => (
                      <tr key={c.tenantId} className="hover:bg-gray-50">
                        <td className="max-w-[220px] truncate px-4 py-2.5">
                          <Link href={`/platform/clinics/${c.tenantId}`} className={LINK}>{c.clinicName}</Link>
                        </td>
                        <td className="px-3 py-2.5"><Meter value={c.redeemed} of={c.paidCodes} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(c.unredeemed)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{php(c.cashReceived)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${c.outstanding ? 'font-medium text-amber-800' : 'text-gray-400'}`}>
                          {c.outstanding ? php(c.outstanding) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-gray-500">No clinic has vouchers yet.</p>
            )}
          </section>

          <section className={CARD} aria-labelledby="batches">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
              <h2 id="batches" className={H2}>Batches</h2>
              <nav aria-label="Filter batches by status" className="flex flex-wrap gap-1.5 text-sm">
                {STATUS_FILTERS.map((f) => {
                  const on = status === f.key;
                  return (
                    <Link
                      key={f.key || 'all'}
                      href={f.key ? `/platform/vouchers?status=${f.key}` : '/platform/vouchers'}
                      aria-current={on ? 'page' : undefined}
                      scroll={false}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 ring-1 ring-inset ${FOCUS_RING} ${
                        on ? 'bg-brand-navy text-white ring-brand-navy' : 'bg-white text-gray-700 ring-gray-200 hover:ring-gray-400'
                      }`}
                    >
                      {f.label}
                      <span className={`tabular-nums ${on ? 'text-slate-300' : 'text-gray-500'}`}>{statusCount(f.key)}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            {shown.length ? (
              <div className="relative mt-3 overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                  <thead className="border-y border-gray-100 bg-gray-50/60 text-left text-xs text-gray-500">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-medium">Batch</th>
                      <th scope="col" className="px-3 py-2 font-medium">Status</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Redeemed</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Made</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shown.map((b) => {
                      const age = Math.floor((asOf - Date.parse(b.createdAt)) / DAY_MS);
                      const sellable = b.quantity - b.voided;
                      return (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <Link href={`/platform/vouchers/${b.id}`} className={`${LINK} font-mono text-xs`}>{b.batchNumber}</Link>
                            <div className="max-w-[220px] truncate text-xs text-gray-500">{b.clinicName}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <BatchStatusBadge status={b.status} />
                            {b.status === 'unpaid' && age > UNPAID_FLAG_DAYS && (
                              <div className="mt-0.5 text-xs font-medium text-amber-700">{age} days unpaid</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {b.status === 'unpaid' ? (
                              <div className="text-right text-xs text-gray-500">{n(b.quantity)} codes, not live yet</div>
                            ) : (
                              <>
                                <Meter value={b.redeemed} of={sellable} />
                                {b.voided > 0 && <div className="text-right text-xs text-gray-500">{n(b.voided)} void</div>}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                            {php(b.status === 'paid' ? (b.amountReceived ?? b.amountDue) : b.amountDue)}
                            {b.status === 'unpaid' && <div className="text-xs text-gray-500">due</div>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{day(b.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-gray-500">
                {status ? `No ${status} batches.` : 'No batches yet. Make the first one with New batch.'}
              </p>
            )}
            {batches.length >= 500 && <p className="px-4 py-3 text-xs text-gray-500">Showing the latest 500 batches. Totals cover every batch.</p>}
          </section>
        </div>

        <div className="space-y-5">
          <section className={`${CARD} p-4`} aria-labelledby="new-batch">
            <h2 id="new-batch" className={`${H2} flex items-center gap-2`}>
              <Ticket aria-hidden="true" className="size-4 text-brand-teal-deep" /> New batch
            </h2>
            <p className="mb-4 mt-0.5 text-xs text-gray-500">Starts unpaid: print it now, the codes work once you mark it paid.</p>
            <NewVoucherBatchForm clinics={clinics} defaults={{ faceValue: fees.voucherFaceValue, wholesalePrice: fees.voucherWholesalePrice }} />
          </section>

          <section className={`${CARD} p-4`} aria-labelledby="lookup">
            <h2 id="lookup" className={`${H2} flex items-center gap-2`}>
              <BadgeCheck aria-hidden="true" className="size-4 text-brand-teal-deep" /> eMCR account lookup
            </h2>
            <p className="mb-4 mt-0.5 text-xs text-gray-500">For &ldquo;my code didn&rsquo;t work&rdquo;: find the account by its mobile number.</p>
            <EmcrAccountLookup />
          </section>
        </div>
      </div>
    </div>
  );
}
