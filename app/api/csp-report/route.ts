import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

/**
 * CSP violation report endpoint.
 * Browsers POST here when a Content-Security-Policy directive is violated.
 * Wire up: add `report-uri /api/csp-report` to the CSP header (see next.config.ts).
 *
 * In production, forward reports to a dedicated service (report-uri.com, Sentry, etc.)
 * by setting SENTRY_DSN or a future REPORT_URI_ENDPOINT env var.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const report = body['csp-report'] ?? body;

    logger.warn('CSP violation', {
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      effectiveDirective: report['effective-directive'],
      documentUri: report['document-uri'],
      referrer: report['referrer'],
      originalPolicy: report['original-policy'],
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
