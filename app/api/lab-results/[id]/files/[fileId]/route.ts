import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { attachmentResponse } from '@/lib/attachment-file';
import { createAuditLog } from '@/lib/audit';

/**
 * Serve a file attached to a lab result (usually the lab's report; lib/attachment-file.ts): shown
 * in the tab when the type is safe to render (images, PDF, text), otherwise downloaded
 * (`?download=1` always downloads). Each opening is audit-logged against the patient.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'lab-results', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return notFound('File');

    const lab = (await LabResult.findOne(tenantFilter(ctx.tenantId, { _id: id }), {
      patient: 1,
      attachments: { $elemMatch: { _id: new Types.ObjectId(fileId) } },
    }).lean()) as { patient?: Types.ObjectId; attachments?: { filename?: string; contentType?: string; url?: string }[] } | null;
    const file = lab?.attachments?.[0];
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
      dataSubject: lab?.patient ? String(lab.patient) : undefined,
      isSensitive: true,
      description: `Opened lab result file ${file.filename ?? fileId}`,
    }));

    const response = await attachmentResponse(file, { download, origin: request.nextUrl.origin });
    return response ?? notFound('File');
  } catch (error) {
    console.error('Error serving lab result file:', error);
    return NextResponse.json({ success: false, error: 'Failed to open the file' }, { status: 500 });
  }
}
