import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

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

    // Return HTML page with embedded document viewer
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${document.title}</title>
        <style>
          body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
          .header { margin-bottom: 20px; }
          .viewer { width: 100%; height: calc(100vh - 100px); border: 1px solid #ddd; }
          iframe { width: 100%; height: 100%; border: none; }
          .pdf-viewer { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${document.title}</h1>
          <p>Category: ${document.category} | Type: ${document.documentType}</p>
        </div>
        <div class="viewer">
          ${document.documentType === 'pdf' 
            ? `<iframe src="${document.url}" class="pdf-viewer"></iframe>`
            : document.documentType === 'image'
            ? `<img src="${document.thumbnailUrl || document.url}" alt="${document.title}" style="max-width: 100%; height: auto;" onclick="window.open('${document.url}', '_blank')" style="cursor: pointer;" />`
            : `<p>Preview not available for ${document.documentType} files. <a href="/api/documents/${id}/download">Download</a> to view.</p>`
          }
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error viewing document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to view document' },
      { status: 500 }
    );
  }
}

