import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_FIELD_LENGTH = 512;

function field(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : undefined;
}

/**
 * CSP violation report endpoint.
 * Browsers POST here when a Content-Security-Policy directive is violated.
 * Wire up: add `report-uri /api/csp-report` to the CSP header (see next.config.ts).
 *
 * Unauthenticated by design, so the body is size-capped and only a few short string
 * fields are logged; nothing is persisted.
 */
export async function POST(request: NextRequest) {
  const noContent = () => new NextResponse(null, { status: 204 });

  try {
    const declared = Number(request.headers.get('content-length') || '0');
    if (declared > MAX_BODY_BYTES) return noContent();

    const text = await request.text();
    if (!text || text.length > MAX_BODY_BYTES) return noContent();

    const body = JSON.parse(text);
    if (!body || typeof body !== 'object') return noContent();
    const report = (body as Record<string, any>)['csp-report'] ?? body;
    if (!report || typeof report !== 'object') return noContent();

    logger.warn('CSP violation', {
      blockedUri: field(report['blocked-uri']),
      violatedDirective: field(report['violated-directive']),
      effectiveDirective: field(report['effective-directive']),
      documentUri: field(report['document-uri']),
      referrer: field(report['referrer']),
    });

    return noContent();
  } catch {
    return noContent();
  }
}
