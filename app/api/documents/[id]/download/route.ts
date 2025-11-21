import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getCloudinaryFileUrl, extractPublicIdFromUrl, isCloudinaryConfigured } from '@/lib/cloudinary';

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
    const document = await Document.findById(id);

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    if (document.status === 'deleted') {
      return NextResponse.json(
        { success: false, error: 'Document has been deleted' },
        { status: 404 }
      );
    }

    // Check if file is stored in Cloudinary
    if (isCloudinaryConfigured() && document.url.startsWith('http')) {
      // File is in Cloudinary - redirect to Cloudinary URL or fetch and proxy
      const publicId = (document.metadata as any)?.cloudinaryPublicId || extractPublicIdFromUrl(document.url);
      
      if (publicId) {
        // Get direct download URL from Cloudinary
        const downloadUrl = getCloudinaryFileUrl(publicId);
        
        // Redirect to Cloudinary URL for download
        return NextResponse.redirect(downloadUrl);
      }
    }

    // Fallback: Extract base64 data from data URL (for files stored in MongoDB)
    if (document.url.startsWith('data:')) {
      const base64Data = document.url.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': document.contentType,
          'Content-Disposition': `attachment; filename="${document.originalFilename}"`,
          'Content-Length': document.size.toString(),
        },
      });
    }

    // If URL is external, redirect to it
    return NextResponse.redirect(document.url);
  } catch (error: any) {
    console.error('Error downloading document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download document' },
      { status: 500 }
    );
  }
}

