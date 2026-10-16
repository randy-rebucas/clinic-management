import * as Sentry from '@sentry/nextjs';
import { sharedSentryOptions } from './lib/sentry-scrub';
import { setErrorReporter } from './lib/logger';

/** Loaded from instrumentation.ts register() only when SENTRY_DSN (or NEXT_PUBLIC_SENTRY_DSN) is set. */
export function initSentryServer(dsn: string): void {
  Sentry.init({
    ...sharedSentryOptions({
      dsn,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
    }),
    includeLocalVariables: false,
  });

  setErrorReporter((error, message, context) => {
    Sentry.withScope((scope) => {
      scope.setTag('logger.message', message.slice(0, 200));
      if (context.tenantId) scope.setTag('tenant_id', context.tenantId);
      if (context.userId) scope.setUser({ id: context.userId });
      scope.setContext('log', context);
      Sentry.captureException(error);
    });
  });
}
