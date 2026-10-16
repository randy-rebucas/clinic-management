import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { requirePermission } from '@/app/lib/auth-helpers';
import { extractTextFromDocument } from '@/lib/document-utils';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { validateUpload, DOCUMENT_UPLOAD_TYPES } from '@/lib/upload-validation';

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'documents', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const formData = await request.formData();
    const file = formData.get('file');
    const documentId = formData.get('documentId');

    const check = await validateUpload(file instanceof File ? file : null, {
      allowed: DOCUMENT_UPLOAD_TYPES,
      maxBytes: 10 * 1024 * 1024,
    });
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    // Extract text using OCR (placeholder - implement actual OCR)
    const ocrText = await extractTextFromDocument(file as File);

    if (documentId) {
      if (!isValidId(documentId)) return notFound('Document');
      const document = await Document.findOneAndUpdate(
        tenantFilter(tenantId, { _id: documentId, status: { $ne: 'deleted' } }),
        {
          $set: {
            scanned: true,
            ocrText: ocrText || undefined,
            lastModifiedBy: session.userId,
            lastModifiedDate: new Date(),
          },
        },
        { new: true }
      ).select('_id documentCode title scanned');

      if (!document) return notFound('Document');

      return NextResponse.json({
        success: true,
        data: {
          document,
          ocrText,
          scanned: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ocrText,
        scanned: true,
      },
    });
  } catch (error: any) {
    console.error('Error scanning document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to scan document' },
      { status: 500 }
    );
  }
}
