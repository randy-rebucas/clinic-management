type RouterTransitionStart = (href: string, navigationType: string) => void;

let routerTransitionStart: RouterTransitionStart | undefined;

// NEXT_PUBLIC_* is inlined at build time, so without a DSN this block (and the Sentry chunk) is
// dropped from the client bundle entirely.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  void Promise.all([import('@sentry/nextjs'), import('./lib/sentry-scrub')])
    .then(([Sentry, { sharedSentryOptions }]) => {
      Sentry.init({
        ...sharedSentryOptions({
          dsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
          release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
          tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
        }),
        // Events go through the same-origin tunnel route; never send the session cookie with them.
        transportOptions: { fetchOptions: { credentials: 'omit' } },
        // No Session Replay: it would record patient data on screen.
      });
      routerTransitionStart = Sentry.captureRouterTransitionStart;
    })
    .catch(() => {
      // Monitoring must never break the app.
    });
}

export function onRouterTransitionStart(href: string, navigationType: string): void {
  routerTransitionStart?.(href, navigationType);
}
