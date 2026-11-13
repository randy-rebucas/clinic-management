import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/seo';
import { Icon, icons, SUPPORT_EMAIL } from '@/components/PublicPage';
import AppReturnRedirect from '@/components/AppReturnRedirect';

export const metadata: Metadata = { title: 'Rep subscription', robots: NO_INDEX };

/**
 * Where PayMongo sends a rep after paying (or cancelling) a rep or team subscription in the
 * browser, or a clinic sponsorship. The subscription is applied by PayMongo's confirmation, never
 * by this page. Opened from the rep app (`app=` deep link), it sends the browser straight back.
 */
export default async function RepPaidPage({ searchParams }: { searchParams: Promise<{ status?: string; app?: string }> }) {
  const query = await searchParams;
  const paid = query.status === 'paid';
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 shadow-[0_20px_50px_rgb(15,23,42,0.08)]">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-teal-light text-brand-teal-dark">
            <Icon d={paid ? icons.check : icons.mail} className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {paid ? 'Payment received' : 'Payment not completed'}
          </h1>
          <p className="text-gray-600 mt-2 leading-relaxed">
            {paid
              ? 'Thank you. Go back to the MyClinicSoft app; your subscription shows there as soon as PayMongo confirms the payment, usually within a few minutes.'
              : 'Nothing was charged. Go back to the app to try again whenever you’re ready.'}
          </p>
          <AppReturnRedirect app={query.app} />
          <p className="mt-6 text-sm text-gray-500">
            Questions? Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Rep subscription')}`} className="font-semibold text-brand-teal-dark underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
