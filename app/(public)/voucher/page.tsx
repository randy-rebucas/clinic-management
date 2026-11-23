import type { Metadata } from 'next';
import Link from 'next/link';
import { getPlatformFees } from '@/lib/platform-config';
import { isPayMongoConfigured } from '@/lib/paymongo';
import VoucherBuyForm from '@/components/voucher/VoucherBuyForm';

export const metadata: Metadata = {
  title: 'Buy an eMCR activation voucher',
  description: 'Activate the eMCR patient app for a year. Pay online with GCash, Maya or card and get your activation code right away.',
};
export const dynamic = 'force-dynamic';

const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 });

const STEPS = [
  { title: 'Pay online', body: 'Enter your email and pay with GCash, Maya, card, GrabPay or QR Ph.' },
  { title: 'Get your code', body: 'Your 12-character activation code appears right after payment and is emailed to you.' },
  { title: 'Activate in the app', body: 'Open eMCR, go to More → Activation, and type the code or scan its QR.' },
];

/** Buy one eMCR activation code online (PayMongo, platform account). */
export default async function VoucherPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  const [fees, payable] = await Promise.all([getPlatformFees(), isPayMongoConfigured()]);
  const price = fees.voucherFaceValue;
  const onSale = payable && price >= 20;

  return (
    <div className="bg-white">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[1fr_26rem]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-teal-dark">eMCR patient app</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">Activate eMCR for a year</h1>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-gray-600">
            One activation code unlocks booking, clinic check-in, the live queue, your records, results and documents, for you and
            the family members you manage.
          </p>

          <ol className="mt-8 space-y-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-teal-light text-sm font-bold text-brand-teal-dark" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{s.title}</p>
                  <p className="text-gray-600">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Already active? A new code adds a year to the date your current one ends. You can also buy a printed
            voucher at the front desk of any clinic that uses eMCR.
          </div>
          <p className="mt-6 text-sm text-gray-600">
            Don&rsquo;t have the app yet?{' '}
            <Link href="/download" className="font-semibold text-brand-teal-dark hover:underline">
              Download eMCR
            </Link>
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-[0_20px_50px_rgb(15,23,42,0.08)] sm:p-8 lg:self-start">
          <p className="text-sm font-medium text-gray-500">1-year activation code</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums text-gray-900">{peso(price)}</p>
          <p className="mt-1 text-sm text-gray-600">One-time payment. No subscription, no auto-renewal.</p>

          {cancelled && (
            <p role="status" className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              You left before paying, so nothing was charged. You can try again below.
            </p>
          )}

          <div className="mt-6">
            {onSale ? (
              <VoucherBuyForm priceLabel={peso(price)} />
            ) : (
              <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                Online vouchers aren&rsquo;t available right now. Please buy one at your clinic&rsquo;s front desk.
              </p>
            )}
          </div>
          <p className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-500">
            By paying you agree to the{' '}
            <Link href="/terms" className="underline hover:text-gray-700">
              Terms of Service
            </Link>
            . Each code can be used once. Vouchers are non-refundable.
          </p>
        </div>
      </div>
    </div>
  );
}
