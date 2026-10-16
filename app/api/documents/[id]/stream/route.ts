import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { loadDocumentFile } from '@/lib/document-file';
import { fileResponseHeaders } from '@/lib/upload-validation';
import { createAuditLog } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'documents', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Document');

    const document = await Document.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean() as any;
    if (!document || document.status === 'deleted') return notFound('Document');

    const file = await loadDocumentFile(document);
    if (!file) {
      return NextResponse.json({ success: false, error: 'File not available' }, { status: 404 });
    }

    // Opening a patient's file is recorded (PH DPA), as on the patient record.
    void createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'view',
      resource: 'document',
      resourceId: document._id,
      dataSubject: document.patient,
      isSensitive: Boolean(document.patient),
      description: `Opened document ${document.documentCode ?? id}`,
    });

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: fileResponseHeaders(file.contentType, document.originalFilename || document.filename, { size: file.buffer.length }),
    });
  } catch (error: any) {
    console.error('Error streaming document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to stream document' },
      { status: 500 }
    );
  }
}
