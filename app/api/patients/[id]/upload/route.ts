import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { addPatientAttachment } from '@/lib/data/patient';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const notes = formData.get('notes') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (tenantId) {
      const { checkStorageLimit } = await import('@/lib/storage-tracking');
      const storageCheck = await checkStorageLimit(tenantId, file.size);
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
    }

    // In a production environment, you would upload to S3, Cloudinary, or similar.
    // For now, store file metadata and a data URL.
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const run = tenantId ? (fn: any) => runWithTenant(tenantId, fn) : (fn: any) => runAsSystem(fn);

    let patient;
    try {
      patient = await run(() =>
        addPatientAttachment(id, {
          filename: file.name,
          contentType: file.type,
          size: file.size,
          url: dataUrl,
          notes: notes || undefined,
          uploadedById: session.userId,
        })
      );
    } catch (error: any) {
      if (error.code === 'P2025') {
        patient = null;
      } else {
        throw error;
      }
    }

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload file' }, { status: 500 });
  }
}
