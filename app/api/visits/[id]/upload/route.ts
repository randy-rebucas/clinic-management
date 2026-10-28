import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { validateUpload } from '@/lib/upload-validation';
import { AttachmentStoreError, storeAttachment } from '@/lib/attachment-file';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'visits', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const { id } = await params;
    if (!isValidId(id)) return notFound('Visit');

    const formData = await request.formData();
    const file = formData.get('file');
    const notes = formData.get('notes');

    const check = await validateUpload(file instanceof File ? file : null);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    const query = tenantFilter(tenantId, { _id: id });
    if (!(await Visit.exists(query))) return notFound('Visit');

    const { checkStorageLimit } = await import('@/lib/storage-tracking');
    const storageCheck = await checkStorageLimit(tenantId, check.buffer.length);
    if (!storageCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: storageCheck.reason || 'Storage limit exceeded',
          storageUsage: storageCheck.currentUsage,
        },
        { status: 403 }
      );
    }

    const url = await storeAttachment(check, { tenantId, kind: 'visit', parent: { model: Visit, filter: query } });
    const attachment = {
      filename: check.filename,
      contentType: check.contentType,
      size: check.buffer.length,
      url,
      uploadDate: new Date(),
      notes: typeof notes === 'string' && notes ? notes.slice(0, 2000) : undefined,
      uploadedBy: session.userId,
    };

    const visit = await Visit.findOneAndUpdate(
      query,
      { $push: { attachments: attachment } },
      { new: true, projection: { 'attachments.url': 0 } }
    )
      .populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'provider', select: 'name email', match: { tenantId: tenantObjectId } });

    if (!visit) return notFound('Visit');

    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    if (error instanceof AttachmentStoreError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error uploading file to visit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
