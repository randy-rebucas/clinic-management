import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const { getTenantContext } = await import('@/lib/tenant');
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    const { Types } = await import('mongoose');
    
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

    // In a production environment, you would upload to S3, Cloudinary, or similar
    // For now, we'll store file metadata and a data URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const attachment = {
      filename: file.name,
      contentType: file.type,
      size: file.size,
      url: dataUrl, // In production, this would be an S3/CDN URL
      uploadDate: new Date(),
      notes: notes || undefined,
      uploadedBy: session.userId,
    };

    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    const patient = await Patient.findOneAndUpdate(
      query,
      { $push: { attachments: attachment } },
      { new: true }
    );

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

