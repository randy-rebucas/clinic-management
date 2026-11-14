import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, Ban, Building2, CircleAlert, CircleCheck, Printer } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadVoucherBatch } from '@/lib/platform-emcr';
import VoucherBatchActions from '@/components/platform/VoucherBatchActions';
import { ColumnChart } from '@/components/platform/charts';
import { BatchStatusBadge, CARD, FOCUS_RING, H2, LINK, ago, day, php, planLabel } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

const n = (v: number) => v.toLocaleString('en-US');
const monthShort = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
const monthLong = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums text-gray-900">{children}</dd>
    </div>
  );
}

export default async function PlatformVoucherBatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const b = await loadVoucherBatch(id);
  if (!b) notFound();

  const sellable = b.quantity - b.voided;
  const usedPct = sellable > 0 ? Math.round((b.redeemed / sellable) * 100) : 0;
  const margin = b.faceValue - b.wholesalePrice;
  const live = b.status === 'paid';

  return (
    <div className="space-y-5">
      <div>
        <Link href="/platform/vouchers" className={`${LINK} inline-flex items-center gap-1 text-sm`}>
          <ArrowLeft aria-hidden="true" className="size-4" /> eMCR vouchers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-xl font-semibold text-gray-900">{b.batchNumber}</h1>
              <BatchStatusBadge status={b.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-gray-500">
              <Building2 aria-hidden="true" className="size-4 text-gray-400" />
              <Link href={`/platform/clinics/${b.tenantId}`} className={LINK}>{b.clinicName}</Link>
              <span>· made {day(b.createdAt)} by {b.createdBy}</span>
            </p>
          </div>
          <Link
            href={`/platform/vouchers/${b.id}/print`}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 sm:w-auto ${FOCUS_RING}`}
          >
            <Printer aria-hidden="true" className="size-4" /> Print vouchers
          </Link>
        </div>
      </div>

      {b.status === 'unpaid' && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>
            <span className="font-semibold">Not paid yet: {php(b.amountDue)} due from the clinic.</span> Printed vouchers don&rsquo;t work
            until the batch is marked paid. Made {ago(b.createdAt).toLowerCase()}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <section className={`${CARD} p-4`} aria-labelledby="redemption">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="redemption" className={H2}>Redemption</h2>
              <span className="text-sm tabular-nums text-gray-700">
                <span className="font-semibold text-gray-900">{n(b.redeemed)}</span> of {n(sellable)} usable codes redeemed
                {sellable > 0 && <span className="text-gray-500"> ({usedPct}%)</span>}
              </span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-gray-100" role="img" aria-label={`${b.redeemed} of ${sellable} usable codes redeemed`}>
              {b.redeemed > 0 && <div className="h-full rounded-full bg-brand-teal-dark" style={{ width: `${Math.max(usedPct, 2)}%` }} />}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Unused">{n(b.unsold)}</Fact>
              <Fact label="Voided">{n(b.voided)}</Fact>
              <Fact label="First redeemed">{b.firstRedeemedAt ? day(b.firstRedeemedAt) : '—'}</Fact>
              <Fact label="Latest">{b.lastRedeemedAt ? ago(b.lastRedeemedAt) : '—'}</Fact>
            </dl>
            {/* Under three months the dates above say it all; a two-column chart adds nothing. */}
            {(live || b.redeemed > 0) && b.redeemedByMonth.length >= 3 ? (
              <div className="mt-5">
                <h3 className="text-xs font-medium text-gray-500">Codes redeemed per month</h3>
                <div className="mt-2">
                  <ColumnChart
                    label={`Codes from batch ${b.batchNumber} redeemed per month`}
                    height={150}
                    format={{ kind: 'count', unit: ['code', 'codes'] }}
                    points={b.redeemedByMonth.map((m) => ({ label: monthShort(m.month), full: monthLong(m.month), value: m.count }))}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className={`${CARD} p-4`} aria-labelledby="batch">
            <h2 id="batch" className={H2}>Batch</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Vouchers">{n(b.quantity)}</Fact>
              <Fact label="Plan">{planLabel(b.plan)}, {b.days} days</Fact>
              <Fact label="Patient price">{php(b.faceValue)}</Fact>
              <Fact label="Clinic pays">{php(b.wholesalePrice)} each</Fact>
              <Fact label="Clinic margin">{php(margin)} per code</Fact>
              <Fact label="Amount due">{php(b.amountDue)}</Fact>
              <Fact label="Patient spend so far">{php(b.redeemed * b.faceValue)}</Fact>
              <Fact label="Clinic earned so far">{php(b.redeemed * margin)}</Fact>
            </dl>
            {b.notes && <p className="mt-4 text-sm text-gray-700"><span className="text-gray-500">Notes: </span>{b.notes}</p>}
          </section>

          <section className={`${CARD} p-4`} aria-labelledby="payment">
            <h2 id="payment" className={`${H2} flex items-center gap-2`}>
              {b.status === 'paid' ? (
                <CircleCheck aria-hidden="true" className="size-4 text-emerald-600" />
              ) : b.status === 'void' ? (
                <Ban aria-hidden="true" className="size-4 text-gray-500" />
              ) : (
                <CircleAlert aria-hidden="true" className="size-4 text-amber-600" />
              )}
              Payment
            </h2>
            {b.status === 'paid' ? (
              <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Received">{php(b.amountReceived ?? b.amountDue)}</Fact>
                <Fact label="On">{day(b.paidAt)}</Fact>
                <Fact label="Reference"><span className="font-mono">{b.paymentRef ?? '—'}</span></Fact>
                <Fact label="Taken by">{b.receivedBy ?? '—'}</Fact>
              </dl>
            ) : b.status === 'void' ? (
              <p className="mt-2 text-sm text-gray-700">
                Voided {day(b.voidedAt)}{b.voidReason ? `: ${b.voidReason}` : ''}.
                {b.paidAt ? ` It had been paid (${php(b.amountReceived ?? b.amountDue)}, ref ${b.paymentRef ?? '—'}).` : ''}
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-700">{php(b.amountDue)} due from the clinic. Mark it paid under Actions once the money arrives.</p>
            )}
          </section>
        </div>

        <section className={`${CARD} p-4 lg:sticky lg:top-6`} aria-labelledby="actions">
          <h2 id="actions" className={`${H2} mb-4`}>Actions</h2>
          <VoucherBatchActions batchId={b.id} status={b.status} amountDue={b.amountDue} unsold={b.unsold} />
        </section>
      </div>
    </div>
  );
}
