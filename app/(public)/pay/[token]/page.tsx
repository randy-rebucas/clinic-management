import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/seo';
import { loadPayPage } from '@/lib/payments/invoice-pay';
import PayPageClient from '@/components/pay/PayPageClient';

export const metadata: Metadata = { title: 'Pay your bill', robots: NO_INDEX };
export const dynamic = 'force-dynamic';

/**
 * The patient's pay page for one clinic bill (link texted or shown by the clinic). Pays into the
 * clinic's or doctor's own account. Shows only the clinic, the invoice number and the balance.
 */
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadPayPage(token);
  return (
    <div className="relative min-h-[70vh] bg-white">
      <div className="relative mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
        {view ? (
          <PayPageClient token={token} view={view} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">This payment link doesn&rsquo;t work</h1>
            <p className="mt-2 text-gray-600">It may have expired. Ask the clinic for a new one, or pay at the clinic.</p>
          </div>
        )}
      </div>
    </div>
  );
}
