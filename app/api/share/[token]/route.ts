import { NextRequest, NextResponse } from 'next/server';
import { createAuditLog } from '@/lib/audit';
import { recordShareAccess, resolveShareLink } from '@/lib/health-summary-share';
import { renderHealthSummaryPdf } from '@/lib/health-summary-pdf';
import { pdfHeaders } from '@/lib/pdf';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import logger from '@/lib/logger';

export const maxDuration = 30;

/** Same limits as GET /api/health-summary/:token. */
const LIMIT = { name: 'health-summary-share', windowMs: 10 * 60 * 1000, maxRequests: 20 };

/** Errors are private too: the URL itself is the secret. */
const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, private, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
};

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status, headers: PRIVATE_HEADERS });
}

/**
 * GET /api/share/:token — a patient's cross-clinic health summary PDF, opened by whoever the
 * patient shared the link with (another doctor). The token comes from
 * POST /api/patients/me/share-links and works until it expires or the patient revokes it.
 * Every open is counted on the link and audit-logged with the caller's IP.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request.headers);
  const limited = await consumeRateLimit(LIMIT, ip);
  if (!limited.allowed) return fail(429, 'Too many downloads. Try again later.');

  const { token } = await params;
  try {
    const now = new Date();
    const resolved = await resolveShareLink(token, now);
    if (!resolved.ok) {
      return resolved.reason === 'invalid'
        ? fail(404, 'This link is not valid.')
        : fail(410, 'This link is no longer available. Ask the patient to share a new one.');
    }

    const rendered = await renderHealthSummaryPdf(resolved.patientId, resolved.tid);
    if (!rendered) return fail(404, 'Health summary not available.');
    const { pdf, summary, filename } = rendered;
    const { link, patientId } = resolved;

    await recordShareAccess(link._id, now);
    // One entry per clinic whose records went into the document.
    await Promise.all(
      summary.clinics.map((clinic) =>
        createAuditLog({
          tenantId: clinic.tenantId,
          action: 'download',
          resource: 'patient',
          resourceId: patientId,
          dataSubject: patientId,
          isSensitive: true,
          description: `Health summary (PDF) opened through the patient's share link${link.label ? ` (for: ${link.label})` : ''}`,
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') ?? undefined,
          requestPath: '/api/share/[token]',
          metadata: { shareLinkId: String(link._id) },
        })
      )
    );

    return new NextResponse(Buffer.from(pdf), { headers: { ...pdfHeaders(filename), 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    logger.error('Error serving shared health summary PDF', error as Error);
    return fail(503, 'The PDF could not be created right now. Try again.');
  }
}
