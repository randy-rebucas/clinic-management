import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import DocumentRequest from '@/models/DocumentRequest';
import '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { createAuditLog } from '@/lib/audit';
import { documentResponse } from '@/lib/pdf';
import { renderRequestedDocument } from '@/lib/document-request-pdf';
import logger from '@/lib/logger';

// Headroom for a cold Chromium start when ?format=pdf.
export const maxDuration = 30;

/**
 * GET /api/document-requests/[id]/preview  (visits → read)
 * What the patient receives for this request, as an unsealed, watermarked preview: before
 * release, exactly what releasing now would give them. ?format=pdf for a PDF.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'visits', 'read');
  if (denied) return denied;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Request');

  try {
    await connectDB();
    const found = await DocumentRequest.findOne({ _id: id, tenantId: ctx.tenantObjectId })
      .populate({ path: 'decidedBy', select: 'name' })
      .lean<any>();
    if (!found) return notFound('Request');

    // Only a released records copy has a cutoff; otherwise show what releasing now would include.
    const released = found.status === 'released' || found.status === 'revoked';
    const rendered = await renderRequestedDocument(request, released ? found : { ...found, cutoff: undefined }, { sealed: false });
    if (!rendered) {
      return NextResponse.json(
        { success: false, error: 'There is nothing to issue yet: the patient record is gone, the visit was cancelled or is a draft, or the abstract isn’t written.' },
        { status: 404 }
      );
    }

    after(() =>
      createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'view',
        resource: 'patient',
        resourceId: String(found.patient),
        dataSubject: String(found.patient),
        requestMethod: 'GET',
        requestPath: request.nextUrl.pathname,
        description: `Previewed requested document ${found.requestCode}`,
        metadata: { documentRequestId: id, kind: found.kind },
      })
    );

    return documentResponse(request, rendered.html, rendered.filename.replace(/\.pdf$/, '-Preview.pdf'));
  } catch (error) {
    logger.error('Error previewing requested document', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to prepare the preview' }, { status: 500 });
  }
}
