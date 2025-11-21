import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { deleteFromCloudinary, extractPublicIdFromUrl } from '@/lib/cloudinary';

export async function GET(
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
    const document = await Document.findById(id)
      .populate('patient', 'firstName lastName patientCode')
      .populate('uploadedBy', 'name')
      .populate('visit', 'visitCode date')
      .populate('appointment', 'appointmentCode')
      .populate('labResult', 'requestCode')
      .populate('invoice', 'invoiceNumber');

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: document });
  } catch (error: any) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const body = await request.json();

    // Update last modified info
    body.lastModifiedBy = session.userId;
    body.lastModifiedDate = new Date();

    const document = await Document.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    })
      .populate('patient', 'firstName lastName patientCode')
      .populate('uploadedBy', 'name');

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: document });
  } catch (error: any) {
    console.error('Error updating document:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update document' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const document = await Document.findById(id);
    
    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    // Delete from Cloudinary if stored there
    if (document.url.startsWith('http')) {
      const publicId = (document.metadata as any)?.cloudinaryPublicId || extractPublicIdFromUrl(document.url);
      if (publicId) {
        await deleteFromCloudinary(publicId);
      }
    }

    // Soft delete by setting status to 'deleted'
    const deletedDocument = await Document.findByIdAndUpdate(
      id,
      { status: 'deleted', lastModifiedBy: session.userId, lastModifiedDate: new Date() },
      { new: true }
    );

    return NextResponse.json({ success: true, data: deletedDocument });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}

