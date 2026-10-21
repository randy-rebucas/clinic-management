import { NextRequest, NextResponse } from 'next/server';
import Document from '@/models/Document';
import logger from '@/lib/logger';
import { createAuditLog } from '@/lib/audit';
import { loadDocumentFile } from '@/lib/document-file';
import { fileResponseHeaders } from '@/lib/upload-validation';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';

/**
 * GET /api/patients/me/documents/[id][?download=true]
 * The file of one of the authenticated patient's documents (same visibility as the list:
 * active and not confidential). Served inline unless `download=true`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Document', 'documents');
    if (isOwnedRecordError(ctx)) return ctx;

    const document = await Document.findOne({
      ...ctx.filter,
      status: 'active',
      isConfidential: { $ne: true },
    }).lean<any>();
    if (!document) return recordNotFound('Document');

    const file = await loadDocumentFile(document);
    if (!file) {
      return NextResponse.json({ success: false, error: 'File not available' }, { status: 404 });
    }

    void createAuditLog({
      userEmail: ctx.patient.email,
      userRole: 'patient',
      tenantId: document.tenantId?.toString(),
      action: 'download',
      resource: 'document',
      resourceId: document._id,
      dataSubject: document.patient,
      isSensitive: true,
      description: `Patient downloaded own document ${document.documentCode ?? id}`,
    });

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: fileResponseHeaders(file.contentType, document.originalFilename || document.filename, {
        download: request.nextUrl.searchParams.get('download') === 'true',
        size: file.buffer.length,
      }),
    });
  } catch (error) {
    logger.error('Error fetching patient document file', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch document' }, { status: 500 });
  }
}
