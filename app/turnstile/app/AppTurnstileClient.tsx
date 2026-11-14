'use client';

import { useEffect } from 'react';
import TurnstileWidget, { TURNSTILE_SITE_KEY } from '@/components/TurnstileWidget';

type AppMessage = { type: 'turnstile'; token: string } | { type: 'turnstile-expired' } | { type: 'turnstile-off' };

function postToApp(message: AppMessage) {
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }).ReactNativeWebView;
  bridge?.postMessage(JSON.stringify(message));
}

export default function AppTurnstileClient() {
  // No site key: the check is off on the server too, so tell the app to go on without it.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) postToApp({ type: 'turnstile-off' });
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <TurnstileWidget
      onToken={(token) => postToApp(token ? { type: 'turnstile', token } : { type: 'turnstile-expired' })}
    />
  );
}
