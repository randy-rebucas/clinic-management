import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getCloudinaryFileUrl, extractPublicIdFromUrl, isCloudinaryConfigured } from '@/lib/cloudinary';
import { getTenantContext } from '@/lib/tenant';
import { tenantScopedQuery } from '@/lib/document-seal';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'documents', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const query = tenantScopedQuery(id, session.tenantId || tenantContext.tenantId);
    const document = query ? await Document.findOne(query) : null;

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
      // File is in Cloudinary - redirect to Cloudinary URL
      const publicId = (document.metadata as any)?.cloudinaryPublicId || extractPublicIdFromUrl(document.url);
      
      if (publicId) {
        // Get direct URL from Cloudinary for inline viewing
        const viewUrl = getCloudinaryFileUrl(publicId);
        return NextResponse.redirect(viewUrl);
      }
    }

    // Handle data URLs (files stored in MongoDB)
    if (document.url.startsWith('data:')) {
      const base64Data = document.url.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': document.contentType || 'application/pdf',
          'Content-Disposition': `inline; filename="${String(document.originalFilename || 'document').replace(/["\r\n\\]/g, '')}"`,
          'Content-Length': buffer.length.toString(),
          // Patient files must never be stored by shared caches/CDNs
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
          'Accept-Ranges': 'bytes',
        },
      });
    }

    // If URL is external, redirect to it
    return NextResponse.redirect(document.url);
  } catch (error: any) {
    console.error('Error streaming document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to stream document' },
      { status: 500 }
    );
  }
}

