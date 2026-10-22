import Link from 'next/link';
import { requirePlatformPage } from '@/lib/platform-auth';
import { loadVoucherOverview } from '@/lib/emcr/vouchers';
import { getPlatformFees } from '@/lib/platform-config';
import NewVoucherBatchForm from '@/components/platform/NewVoucherBatchForm';
import EmcrAccountLookup from '@/components/platform/EmcrAccountLookup';
import { BatchStatusBadge, CARD, H2, LINK, day, php } from '@/components/platform/shared';

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

const n = (v: number) => v.toLocaleString('en-US');

export default async function PlatformVouchersPage() {
  await requirePlatformPage();
  const [{ batches, totals: t, byClinic, clinics }, fees] = await Promise.all([loadVoucherOverview(), getPlatformFees()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">eMCR vouchers</h1>
        <p className="text-sm text-gray-500">Activation codes clinics buy prepaid and sell to patients at the counter.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Cash received" value={php(t.cashReceived)} note="From clinics, for paid batches" />
        <Tile label="Outstanding" value={php(t.cashOutstanding)} note="Due on unpaid batches" />
        <Tile label="Codes sold" value={n(t.codesSold)} note="In paid batches, less voided codes" />
        <Tile label="Redeemed" value={n(t.codesRedeemed)} note={t.codesSold ? `${Math.round((t.codesRedeemed / t.codesSold) * 100)}% of codes sold` : 'Activated by patients'} />
        <Tile label="Unredeemed stock" value={n(t.unredeemedPaid)} note="Paid codes still at clinics" />
        <Tile label="Active accounts" value={n(t.activeAccounts)} note="eMCR accounts not yet expired" />
        <Tile label="Patient spend" value={php(t.patientSpend)} note="Face value of redeemed codes" />
        <Tile label="Clinic commission" value={php(t.clinicCommission)} note="Clinics’ margin on redeemed codes" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`} aria-labelledby="by-clinic">
          <h2 id="by-clinic" className={`${H2} px-5 pt-5`}>By clinic</h2>
          {byClinic.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th scope="col" className="px-5 py-2 font-medium">Clinic</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Paid codes</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Redeemed</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">In stock</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Received</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byClinic.map((c) => (
                    <tr key={c.tenantId}>
                      <td className="px-5 py-2.5">
                        <Link href={`/platform/clinics/${c.tenantId}`} className={LINK}>{c.clinicName}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(c.paidCodes)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(c.redeemed)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(c.unredeemed)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{php(c.cashReceived)}</td>
                      <td className={`px-5 py-2.5 text-right tabular-nums ${c.outstanding ? 'font-medium text-amber-800' : 'text-gray-500'}`}>{php(c.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-500">No clinic has vouchers yet.</p>
          )}
        </section>

        <section className={`${CARD} p-5`} aria-labelledby="new-batch">
          <h2 id="new-batch" className={H2}>New batch</h2>
          <p className="mb-4 mt-0.5 text-xs text-gray-500">Starts unpaid: print it now, the codes work once you mark it paid.</p>
          <NewVoucherBatchForm clinics={clinics} defaults={{ faceValue: fees.voucherFaceValue, wholesalePrice: fees.voucherWholesalePrice }} />
        </section>
      </div>

      <section className={CARD} aria-labelledby="batches">
        <h2 id="batches" className={`${H2} px-5 pt-5`}>Batches</h2>
        {batches.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th scope="col" className="px-5 py-2 font-medium">Batch</th>
                  <th scope="col" className="px-3 py-2 font-medium">Clinic</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Codes</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Redeemed</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Made</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-5 py-2.5">
                      <Link href={`/platform/vouchers/${b.id}`} className={`${LINK} font-mono text-xs`}>{b.batchNumber}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{b.clinicName}</td>
                    <td className="px-3 py-2.5"><BatchStatusBadge status={b.status} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                      {n(b.quantity)}
                      {b.voided > 0 && <span className="text-xs text-gray-500"> ({b.voided} void)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{n(b.redeemed)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                      {php(b.status === 'paid' ? (b.amountReceived ?? b.amountDue) : b.amountDue)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{day(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-gray-500">No batches yet. Make the first one above.</p>
        )}
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="lookup">
        <h2 id="lookup" className={H2}>eMCR account lookup</h2>
        <p className="mb-4 mt-0.5 text-xs text-gray-500">For &ldquo;my code didn&rsquo;t work&rdquo;: find the account by its mobile number.</p>
        <EmcrAccountLookup />
      </section>
    </div>
  );
}
