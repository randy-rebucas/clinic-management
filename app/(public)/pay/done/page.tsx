import Link from 'next/link';
import { Icon, icons } from '@/components/PublicPage';

export const metadata = { title: 'Payment', robots: { index: false } };

/** Where PayMongo sends a patient after paying a clinic's payment link. Says nothing about the bill. */
export default async function PayDonePage({ searchParams }: { searchParams: Promise<{ ref?: string; cancelled?: string }> }) {
  const { ref, cancelled } = await searchParams;
  const safeRef = ref && /^[A-Za-z0-9_-]{1,40}$/.test(ref) ? ref : null;

  return (
    <div className="relative min-h-[70vh] bg-white overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[24rem]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <div className="relative mx-auto max-w-lg px-4 sm:px-6 py-12 sm:py-20">
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-[0_20px_50px_rgb(15,23,42,0.08)]">
          {cancelled ? (
            <>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Payment not made</h1>
              <p className="text-gray-600 mt-2 leading-relaxed">
                You left before paying, so nothing was charged. Open the payment link from your clinic again whenever
                you&apos;re ready.
              </p>
            </>
          ) : (
            <>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-dark">
                <Icon d={icons.check} className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Thank you for your payment</h1>
              <p className="text-gray-600 mt-2 leading-relaxed">
                Your clinic will see it on your bill within a few minutes, and PayMongo emails you a receipt.
              </p>
              {safeRef && (
                <div className="mt-6 flex items-center justify-between gap-3 rounded-md bg-gray-50 px-4 py-3 text-sm">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-mono font-semibold text-gray-900">{safeRef}</span>
                </div>
              )}
            </>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/download"
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-brand-teal px-4 py-2.5 font-semibold text-white transition-colors duration-150 hover:bg-brand-teal-dark"
            >
              <Icon d={icons.phone} className="w-4 h-4" />
              Get the eMCR app
            </Link>
            <Link
              href="/"
              className="inline-flex flex-1 items-center justify-center rounded-md border border-gray-300 px-5 py-2.5 font-semibold text-gray-900 transition-colors duration-150 hover:border-gray-900"
            >
              Back to home
            </Link>
          </div>
          <p className="mt-6 border-t border-gray-100 pt-5 text-sm text-gray-500">
            Questions about your bill? Contact your clinic directly
            {cancelled ? '.' : ' — they can see your payment and invoice.'}
          </p>
        </div>
      </div>
    </div>
  );
}
