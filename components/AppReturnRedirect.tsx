'use client';

import { useEffect } from 'react';
import { isAllowedAppReturnUrl } from '@/lib/rep-app-return-url';

/**
 * Sends the browser back to the rep app when a payment page was opened from it (`app=` deep
 * link). Some browsers only follow an app link after a tap, so it also renders a button.
 */
export default function AppReturnRedirect({ app }: { app: string | undefined }) {
  const url = isAllowedAppReturnUrl(app) ? app : null;
  useEffect(() => {
    if (url) window.location.href = url;
  }, [url]);
  if (!url) return null;
  return (
    <a
      href={url}
      className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-teal-dark px-5 py-3 text-sm font-semibold text-white"
    >
      Back to the app
    </a>
  );
}
