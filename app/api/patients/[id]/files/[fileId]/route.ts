import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { ownAttachmentMatch } from '@/lib/patient-attachments';
import { attachmentResponse, deleteStoredAttachment } from '@/lib/attachment-file';
import { createAuditLog } from '@/lib/audit';

/**
 * Serve one of the patient's files (lib/attachment-file.ts): shown in the tab when the type is
 * safe to render (images, PDF, text), otherwise downloaded (`?download=1` always downloads).
 * Each opening is audit-logged against the patient.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return notFound('File');

    const patient = (await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id }), { attachments: { $elemMatch: ownAttachmentMatch(ctx.tenantId, fileId) } }).lean()) as {
      attachments?: { filename?: string; contentType?: string; url?: string }[];
    } | null;
    const file = patient?.attachments?.[0];
    if (!file?.url) return notFound('File');

    const download = request.nextUrl.searchParams.get('download') === '1';
    after(() => createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: download ? 'download' : 'view',
      resource: 'document',
      resourceId: fileId,
      dataSubject: id,
      isSensitive: true,
      description: `Opened patient file ${file.filename ?? fileId}`,
    }));

    const response = await attachmentResponse(file, { download, origin: request.nextUrl.origin });
    return response ?? notFound('File');
  } catch (error) {
    console.error('Error serving patient file:', error);
    return NextResponse.json({ success: false, error: 'Failed to open the file' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return notFound('Patient');

    // The record as it was, so the removed file's stored copy can be deleted too.
    const patient = await Patient.findOneAndUpdate(
      patientTenantFilter(ctx.tenantId, { _id: id, attachments: { $elemMatch: ownAttachmentMatch(ctx.tenantId, fileId) } }),
      { $pull: { attachments: ownAttachmentMatch(ctx.tenantId, fileId) } },
      { projection: { attachments: { $elemMatch: ownAttachmentMatch(ctx.tenantId, fileId) } } }
    ).lean<{ attachments?: { url?: string }[] }>();

    if (!patient) return notFound('File');
    await deleteStoredAttachment(patient.attachments?.[0]?.url);

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
