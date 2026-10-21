import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadVoucherBatch } from '@/lib/platform-emcr';
import VoucherBatchActions from '@/components/platform/VoucherBatchActions';
import { BatchStatusBadge, CARD, H2, LINK, day, php, planLabel } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default async function PlatformVoucherBatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { id } = await params;
  const b = await loadVoucherBatch(id);
  if (!b) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/vouchers" className={`${LINK} text-sm`}>eMCR vouchers</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-gray-900">{b.batchNumber}</h1>
          <BatchStatusBadge status={b.status} />
        </div>
        <p className="text-sm text-gray-500">
          <Link href={`/platform/clinics/${b.tenantId}`} className={LINK}>{b.clinicName}</Link> · made {day(b.createdAt)} by {b.createdBy}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={`${CARD} p-5`} aria-labelledby="batch">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="batch" className={H2}>Batch</h2>
              <Link href={`/platform/vouchers/${b.id}/print`} className={`${LINK} text-sm`}>Print vouchers</Link>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Vouchers">{b.quantity.toLocaleString('en-US')}</Fact>
              <Fact label="Plan">{planLabel(b.plan)}, {b.days} days</Fact>
              <Fact label="Patient price">{php(b.faceValue)}</Fact>
              <Fact label="Clinic pays">{php(b.wholesalePrice)} each</Fact>
              <Fact label="Unused">{b.unsold.toLocaleString('en-US')}</Fact>
              <Fact label="Redeemed">{b.redeemed.toLocaleString('en-US')}</Fact>
              <Fact label="Voided">{b.voided.toLocaleString('en-US')}</Fact>
              <Fact label="Amount due">{php(b.amountDue)}</Fact>
            </dl>
            {b.notes && <p className="mt-4 text-sm text-gray-700"><span className="text-gray-500">Notes: </span>{b.notes}</p>}
          </section>

          <section className={`${CARD} p-5`} aria-labelledby="payment">
            <h2 id="payment" className={H2}>Payment</h2>
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
              <p className="mt-2 text-sm text-gray-700">
                Not paid yet: {php(b.amountDue)} due from the clinic. Printed vouchers don&rsquo;t work until the batch is marked paid.
              </p>
            )}
          </section>
        </div>

        <section className={`${CARD} p-5`} aria-labelledby="actions">
          <h2 id="actions" className={`${H2} mb-4`}>Actions</h2>
          <VoucherBatchActions batchId={b.id} status={b.status} amountDue={b.amountDue} unsold={b.unsold} />
        </section>
      </div>
    </div>
  );
}
