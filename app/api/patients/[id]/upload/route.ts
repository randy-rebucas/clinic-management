import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { validateUpload } from '@/lib/upload-validation';
import { AttachmentStoreError, storeAttachment } from '@/lib/attachment-file';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const formData = await request.formData();
    const file = formData.get('file');
    const notes = formData.get('notes');

    const check = await validateUpload(file instanceof File ? file : null);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    const exists = await Patient.exists(patientTenantFilter(tenantId, { _id: id }));
    if (!exists) return notFound('Patient');

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

    const url = await storeAttachment(check, {
      tenantId,
      kind: 'patient',
      parent: { model: Patient, filter: patientTenantFilter(tenantId, { _id: id }) },
    });
    const attachment = {
      filename: check.filename,
      contentType: check.contentType,
      size: check.buffer.length,
      url,
      uploadDate: new Date(),
      notes: typeof notes === 'string' && notes ? notes.slice(0, 2000) : undefined,
      uploadedBy: session.userId,
      tenantId: ctx.tenantObjectId,
    };

    // Only the new file's details go back: the record holds other clinics' files too.
    const patient = await Patient.findOneAndUpdate(
      patientTenantFilter(tenantId, { _id: id }),
      { $push: { attachments: attachment } },
      { new: true, projection: { attachments: { $slice: -1 } } }
    ).lean<{ attachments?: Array<Record<string, unknown>> }>();

    if (!patient) return notFound('Patient');

    const { url: _stored, ...added } = patient.attachments?.[0] ?? {};
    return NextResponse.json({ success: true, data: patient.attachments?.length ? added : null });
  } catch (error: any) {
    if (error instanceof AttachmentStoreError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
