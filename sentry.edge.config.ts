import * as Sentry from '@sentry/nextjs';
import { sharedSentryOptions } from './lib/sentry-scrub';

/** Loaded from instrumentation.ts register() only when SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is set. */
export function initSentryEdge(dsn: string): void {
  Sentry.init(
    sharedSentryOptions({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
    }),
  );
}
