import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/seo';
import AppTurnstileClient from './AppTurnstileClient';

export const metadata: Metadata = { title: 'Security check', robots: NO_INDEX };

/**
 * The Cloudflare Turnstile check for the eMedRoute app, which has no native widget: the app opens
 * this page in a WebView and receives the token through `window.ReactNativeWebView.postMessage`.
 * Served from our own domain so the widget's hostname check passes.
 */
export default function AppTurnstilePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-4">
      <AppTurnstileClient />
    </main>
  );
}
