import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { validateUpload } from '@/lib/upload-validation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Lab result');

    const formData = await request.formData();
    const file = formData.get('file');
    const notes = formData.get('notes');

    const check = await validateUpload(file instanceof File ? file : null);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    const labResult = await LabResult.findOne(tenantFilter(tenantId, { _id: id }));
    if (!labResult) return notFound('Lab result');

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

    labResult.attachments.push({
      filename: check.filename,
      contentType: check.contentType,
      size: check.buffer.length,
      url: `data:${check.contentType};base64,${check.buffer.toString('base64')}`,
      uploadDate: new Date(),
      notes: typeof notes === 'string' && notes ? notes.slice(0, 2000) : undefined,
      uploadedBy: session.userId,
    } as any);

    // Update status to completed if results are uploaded
    if (labResult.status === 'ordered' || labResult.status === 'in-progress') {
      labResult.status = 'completed';
      if (!labResult.resultDate) {
        labResult.resultDate = new Date();
      }
    }

    await labResult.save();
    await labResult.populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } });
    await labResult.populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });
    await labResult.populate('orderedBy', 'name email');

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error uploading lab result file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
