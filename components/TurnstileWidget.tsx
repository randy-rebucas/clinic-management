'use client';

import { useEffect, useRef } from 'react';

/** Set alongside TURNSTILE_SECRET_KEY; without it no widget renders and the server skips the check. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

let scriptPromise: Promise<Turnstile> | null = null;

// Injected by our own (nonced) bundle, so CSP 'strict-dynamic' allows it; frame-src allows the widget.
function loadTurnstile(): Promise<Turnstile> {
  const existing = (window as unknown as { turnstile?: Turnstile }).turnstile;
  if (existing) return Promise.resolve(existing);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load the security check'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget. Tokens are single-use: remount it (change its `key`) after
 * each submit attempt to get a fresh one.
 */
export default function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) return;
    let widgetId: string | null = null;
    let api: Turnstile | null = null;
    let cancelled = false;
    const el = containerRef.current;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        api = turnstile;
        widgetId = turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
      if (api && widgetId) api.remove(widgetId);
      onTokenRef.current(null);
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="min-h-[65px]" />;
}
