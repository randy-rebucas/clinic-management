import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { validateUpload } from '@/lib/upload-validation';

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

    const attachment = {
      filename: check.filename,
      contentType: check.contentType,
      size: check.buffer.length,
      url: `data:${check.contentType};base64,${check.buffer.toString('base64')}`,
      uploadDate: new Date(),
      notes: typeof notes === 'string' && notes ? notes.slice(0, 2000) : undefined,
      uploadedBy: session.userId,
    };

    const patient = await Patient.findOneAndUpdate(
      patientTenantFilter(tenantId, { _id: id }),
      { $push: { attachments: attachment } },
      { new: true }
    );

    if (!patient) return notFound('Patient');

    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
