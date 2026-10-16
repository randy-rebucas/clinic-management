import type { Instrumentation } from 'next';

const sentryDsn = () => process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  // Only run on the Node.js runtime (server), not on the Edge runtime.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env-validation');
    validateEnv(); // throws in production if required vars are missing or malformed
  }

  // Sentry stays completely unloaded unless a DSN is configured.
  const dsn = sentryDsn();
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initSentryServer } = await import('./sentry.server.config');
    initSentryServer(dsn);
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    const { initSentryEdge } = await import('./sentry.edge.config');
    initSentryEdge(dsn);
  }
}

/**
 * Structured log line for every unhandled server error (route handlers, server components,
 * server actions, proxy), so production failures show up in Vercel logs. The logger omits
 * stack traces outside development; request headers are deliberately not logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err instanceof Error ? err : new Error(String(err));

  if (sentryDsn()) {
    try {
      const Sentry = await import('@sentry/nextjs');
      // Captured first so the logger's reporter skips the same Error object (Sentry dedupes it).
      Sentry.captureRequestError(error, request, context);
    } catch {
      // Never let error reporting throw.
    }
  }

  try {
    const { logger } = await import('./lib/logger');
    const digest = (err as { digest?: unknown })?.digest;
    logger.error('Unhandled request error', error, {
      // Drop the query string: it can carry tokens (e.g. appointment confirm links).
      path: request.path.split('?')[0],
      method: request.method,
      digest: typeof digest === 'string' ? digest : undefined,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      runtime: process.env.NEXT_RUNTIME,
    });
  } catch {
    // Never let error reporting throw.
  }
};
