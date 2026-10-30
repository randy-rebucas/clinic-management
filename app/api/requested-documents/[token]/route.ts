import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import DocumentRequest from '@/models/DocumentRequest';
import '@/models/User';
import { htmlToPdf, pdfHeaders } from '@/lib/pdf';
import { isDownloadable, KIND_LABELS } from '@/lib/document-requests';
import { readDocumentRequestLinkToken } from '@/lib/document-request-link';
import { renderRequestedDocument } from '@/lib/document-request-pdf';
import { createAuditLog } from '@/lib/audit';
import { consumeRateLimit, getClientIp } from '@/lib/middleware/rate-limit';
import logger from '@/lib/logger';

export const maxDuration = 30;

const LIMIT = { name: 'requested-document-pdf', windowMs: 10 * 60 * 1000, maxRequests: 20 };

/**
 * GET /api/requested-documents/:token — a released document request (medical records copy or
 * medical certificate) as a sealed PDF, patient copy. The token comes from
 * POST /api/patients/me/document-requests/:id/pdf-link and lasts 10 minutes. Repeat downloads
 * of unchanged content carry the same seal.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await consumeRateLimit(LIMIT, getClientIp(request.headers));
  if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many downloads. Try again later.' }, { status: 429 });

  const { token } = await params;
  const id = readDocumentRequestLinkToken(token);
  if (!id) {
    return NextResponse.json({ success: false, error: 'This link has expired. Open the request in the app again.' }, { status: 410 });
  }

  try {
    await connectDB();
    const found = await DocumentRequest.findById(id).populate({ path: 'decidedBy', select: 'name' }).lean<Record<string, any> | null>();
    // Checked again here: the clinic may have withdrawn it since the link was made.
    if (!found || !isDownloadable(found)) {
      return NextResponse.json({ success: false, error: 'This document is not available.' }, { status: 404 });
    }

    const rendered = await renderRequestedDocument(request, found, { sealed: true });
    if (!rendered) return NextResponse.json({ success: false, error: 'This document is not available.' }, { status: 404 });
    const pdf = await htmlToPdf(rendered.html);

    await Promise.all([
      DocumentRequest.updateOne({ _id: found._id }, { $inc: { downloadCount: 1 }, $set: { lastDownloadedAt: new Date() } }),
      createAuditLog({
        tenantId: String(found.tenantId),
        userRole: 'patient',
        action: 'download',
        resource: found.kind === 'medical_certificate' ? 'visit' : 'patient',
        resourceId: String(found.kind === 'medical_certificate' ? found.visit : found.patient),
        dataSubject: String(found.patient),
        isSensitive: true,
        description: `Patient downloaded their ${KIND_LABELS[found.kind as keyof typeof KIND_LABELS].toLowerCase()} ${found.requestCode} (copy #${rendered.seal?.printNumber})`,
        ipAddress: getClientIp(request.headers),
        metadata: { documentRequestId: id, kind: found.kind },
      }),
    ]);

    return new NextResponse(Buffer.from(pdf), { headers: pdfHeaders(rendered.filename) });
  } catch (error) {
    logger.error('Error rendering requested document PDF', error as Error);
    return NextResponse.json({ success: false, error: 'The PDF could not be created right now. Try again.' }, { status: 503 });
  }
}
