import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { EMCR_APP_STORE_URL, EMCR_PLAY_STORE_URL, NO_INDEX } from '@/lib/seo';
import { getPlatformFees } from '@/lib/platform-config';

/**
 * Target of the eMCR download QR code (printed on prescriptions): the store button for the
 * scanner's phone first, then how to activate the app with a voucher (bought online at /voucher
 * or at a clinic). Detection is by User-Agent (headers()), so it runs per request.
 */
export const metadata: Metadata = { title: 'Download eMCR', robots: NO_INDEX };

type Platform = 'android' | 'ios' | 'other';

function detectPlatform(userAgent: string): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'other';
}

const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 });
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2';
const PRIMARY = `inline-flex items-center justify-center rounded-md bg-brand-teal-dark px-5 py-3 font-semibold text-white hover:bg-brand-teal-deep ${FOCUS}`;
const SECONDARY = `inline-flex items-center justify-center rounded-md border border-gray-300 px-5 py-3 font-semibold text-gray-900 hover:border-gray-900 ${FOCUS}`;

export default async function DownloadPage() {
  const platform = detectPlatform((await headers()).get('user-agent') ?? '');
  const { voucherFaceValue } = await getPlatformFees();

  const stores = [
    { key: 'android', label: 'Get it on Google Play', href: EMCR_PLAY_STORE_URL },
    ...(EMCR_APP_STORE_URL ? [{ key: 'ios', label: 'Download on the App Store', href: EMCR_APP_STORE_URL }] : []),
  ];
  // The scanner's own store first; on iPhone without an App Store listing there is none.
  const ordered = [...stores].sort((a, b) => Number(b.key === platform) - Number(a.key === platform));
  const unsupportedPhone = platform === 'ios' && !EMCR_APP_STORE_URL;

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Step 1: install */}
        <section aria-labelledby="install-heading">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-teal-dark">Step 1</p>
          <h1 id="install-heading" className="mt-1 text-3xl font-extrabold tracking-tight text-gray-900">
            Get the eMCR app
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Your prescriptions, records, results and clinic bookings on your phone.
          </p>
          {unsupportedPhone ? (
            <p className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700">
              eMCR isn&rsquo;t on the App Store yet. It&rsquo;s available for Android phones from Google Play.
            </p>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {ordered.map((s, i) => (
                <a key={s.key} href={s.href} className={i === 0 ? PRIMARY : SECONDARY} rel="noopener">
                  {s.label}
                </a>
              ))}
            </div>
          )}
          {platform === 'other' && (
            <p className="mt-3 text-sm text-gray-600">On a computer? Open this page on your phone, or search &ldquo;eMCR&rdquo; in your app store.</p>
          )}
        </section>

        {/* Step 2: activate */}
        <section aria-labelledby="activate-heading" className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-teal-dark">Step 2</p>
          <h2 id="activate-heading" className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900">
            Activate your app
          </h2>
          <p className="mt-2 text-gray-700">
            eMCR needs an activation code to unlock booking, check-in, the live queue, results and documents. One code is{' '}
            <strong>{peso(voucherFaceValue)} for a full year</strong>, for you and the family members you manage.
          </p>
          <ol className="mt-5 list-decimal space-y-2 pl-5 text-gray-700">
            <li>Buy a voucher online. Your code is generated right after you pay with GCash, Maya or card, and emailed to you.</li>
            <li>
              In the app, go to <strong>More → Activation</strong> and enter the code, or scan its QR.
            </li>
          </ol>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/voucher" className={PRIMARY}>
              Buy an activation voucher
            </Link>
            <p className="text-sm text-gray-600">Or buy a printed voucher at your clinic&rsquo;s front desk.</p>
          </div>
        </section>

        <p className="mt-8 text-sm text-gray-600">
          Already have the app on your phone?{' '}
          <Link href="/my-qr" className="font-semibold text-brand-teal-dark hover:underline">
            Show a sign-in QR here
          </Link>{' '}
          and scan it with the app.
        </p>
      </div>
    </div>
  );
}
