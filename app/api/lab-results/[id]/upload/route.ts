import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const notes = formData.get('notes') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get tenant context
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Check storage limit before uploading
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

    const labResult = await LabResult.findById(id);
    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    // Convert file to base64 (in production, use S3/Cloudinary)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const attachment = {
      filename: file.name,
      contentType: file.type,
      size: file.size,
      url: dataUrl,
      uploadDate: new Date(),
      notes: notes || undefined,
      uploadedBy: session.userId,
    };

    labResult.attachments.push(attachment);

    // Update status to completed if results are uploaded
    if (labResult.status === 'ordered' || labResult.status === 'in-progress') {
      labResult.status = 'completed';
      if (!labResult.resultDate) {
        labResult.resultDate = new Date();
      }
    }

    await labResult.save();
    await labResult.populate('patient', 'firstName lastName patientCode email phone');
    await labResult.populate('visit', 'visitCode date');
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

