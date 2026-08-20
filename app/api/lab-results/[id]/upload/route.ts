import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { findLabResultRawById, addLabResultAttachment, updateLabResult } from '@/lib/data/lab-result';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const notes = formData.get('notes') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

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

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const labResult = await run(tenantId, async () => {
      const existing = await findLabResultRawById(id);
      if (!existing) return null;

      // Update status to completed if results are uploaded
      const statusUpdate: Record<string, any> = {};
      if (existing.status === 'ordered' || existing.status === 'in_progress') {
        statusUpdate.status = 'completed';
        if (!existing.resultDate) {
          statusUpdate.resultDate = new Date();
        }
      }
      if (Object.keys(statusUpdate).length > 0) {
        await updateLabResult(id, statusUpdate as any);
      }

      return addLabResultAttachment(id, {
        filename: file.name,
        contentType: file.type,
        size: file.size,
        url: dataUrl,
        notes: notes || undefined,
        uploadedById: session.userId,
      });
    });

    if (!labResult) {
      return NextResponse.json({ success: false, error: 'Lab result not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error uploading lab result file:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload file' }, { status: 500 });
  }
}
