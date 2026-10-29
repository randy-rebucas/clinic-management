import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EMCR_APP_STORE_URL, EMCR_PLAY_STORE_URL, NO_INDEX } from '@/lib/seo';
import IpadStoreRedirect from '@/components/IpadStoreRedirect';

/**
 * Target of the eMCR download QR code: sends the scanner straight to their platform's store.
 * Detection is by User-Agent (headers()), so it runs per request.
 */
export const metadata: Metadata = { title: 'Download eMCR', robots: NO_INDEX };

type Platform = 'android' | 'ios' | 'other';

function detectPlatform(userAgent: string): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'other';
}

export default async function DownloadPage() {
  const platform = detectPlatform((await headers()).get('user-agent') ?? '');

  if (platform === 'android') redirect(EMCR_PLAY_STORE_URL);
  if (platform === 'ios' && EMCR_APP_STORE_URL) redirect(EMCR_APP_STORE_URL);

  return (
    <section className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      {EMCR_APP_STORE_URL && <IpadStoreRedirect appStoreUrl={EMCR_APP_STORE_URL} />}
      <div className="max-w-md text-center">
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Your device is not yet supported</h1>
        <p className="text-gray-600">
          {EMCR_APP_STORE_URL
            ? 'The eMCR app is available for Android phones and iPhones. Open this link on your phone to download it.'
            : 'The eMCR app is available for Android phones. Open this link on an Android device to download it from Google Play.'}
        </p>
        <p className="mt-6 text-sm text-gray-600">
          Already have the app on your phone?{' '}
          <Link href="/my-qr" className="font-semibold text-brand-teal-dark hover:underline">
            Show a sign-in QR here
          </Link>{' '}
          and scan it with the app.
        </p>
      </div>
    </section>
  );
}
