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

    // Determine the PDF URL to use
    let pdfUrl = document.url;
    
    // If it's a data URL or needs inline viewing, use the stream endpoint
    if (document.url.startsWith('data:') || document.documentType === 'pdf') {
      pdfUrl = `/api/documents/${id}/stream`;
    }

    // Helper function to format category label
    const getCategoryLabel = (category: string): string => {
      return category.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    };

    const categoryLabel = getCategoryLabel(document.category);

    // Return HTML page with embedded document viewer
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${document.title}</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body { 
            margin: 0; 
            padding: 0; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background-color: #f3f4f6;
          }
          .header { 
            background: white;
            padding: 16px 20px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .header h1 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
          }
          .header-info {
            font-size: 14px;
            color: #6b7280;
          }
          .header-actions {
            display: flex;
            gap: 8px;
          }
          .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
          }
          .btn-primary {
            background-color: #2563eb;
            color: white;
          }
          .btn-primary:hover {
            background-color: #1d4ed8;
          }
          .btn-secondary {
            background-color: #f3f4f6;
            color: #374151;
            border: 1px solid #d1d5db;
          }
          .btn-secondary:hover {
            background-color: #e5e7eb;
          }
          .viewer { 
            width: 100%; 
            height: calc(100vh - 60px); 
            background: #525252;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .viewer iframe,
          .viewer object,
          .viewer embed { 
            width: 100%; 
            height: 100%; 
            border: none; 
            background: white;
          }
          .viewer object {
            display: block;
          }
          .viewer img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .viewer img:hover {
            box-shadow: 0 8px 12px rgba(0,0,0,0.15);
          }
          .error-message {
            padding: 40px;
            text-align: center;
            color: #6b7280;
            background: white;
            border-radius: 8px;
            margin: 20px;
          }
          .error-message a {
            color: #2563eb;
            text-decoration: none;
          }
          .error-message a:hover {
            text-decoration: underline;
          }
          @media print {
            .header {
              display: none;
            }
            .viewer {
              height: 100vh;
            }
          }
          .pdf-fallback {
            padding: 40px;
            text-align: center;
            background: white;
            border-radius: 8px;
            margin: 20px;
          }
          .pdf-fallback h3 {
            margin: 0 0 16px 0;
            color: #1f2937;
          }
          .pdf-fallback p {
            margin: 0 0 20px 0;
            color: #6b7280;
          }
        </style>
        <script>
          // Fallback if PDF fails to load
          window.addEventListener('load', function() {
            const pdfObject = document.querySelector('.pdf-viewer');
            if (pdfObject) {
              // Check if object failed to load (some browsers don't fire error events)
              setTimeout(function() {
                // If object has no content, show fallback
                if (pdfObject.offsetHeight === 0 || pdfObject.style.display === 'none') {
                  showPdfFallback();
                }
              }, 1000);
            }
          });
          
          function showPdfFallback() {
            const viewer = document.querySelector('.viewer');
            if (viewer) {
              const docId = '${id}';
              viewer.innerHTML = '<div class="pdf-fallback"><h3>PDF Viewer Not Available</h3><p>Your browser cannot display PDFs inline. Please download or open in a new window.</p><a href="/api/documents/' + docId + '/download" class="btn btn-primary" style="display: inline-block; margin-right: 8px;">Download PDF</a><a href="/api/documents/' + docId + '/stream" target="_blank" class="btn btn-secondary" style="display: inline-block;">Open in New Window</a></div>';
            }
          }
        </script>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${document.title}</h1>
            <div class="header-info">
              ${categoryLabel} • ${document.documentType.toUpperCase()}
            </div>
          </div>
          <div class="header-actions">
            ${document.documentType === 'pdf' 
              ? `<a href="/api/documents/${id}/stream" target="_blank" class="btn btn-primary">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Open PDF
                </a>`
              : ''
            }
            <a href="/api/documents/${id}/download" class="btn btn-secondary" download>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </a>
            <button onclick="window.print()" class="btn btn-secondary">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          </div>
        </div>
        <div class="viewer">
          ${document.documentType === 'pdf' 
            ? `<object data="${pdfUrl}" type="application/pdf" class="pdf-viewer" style="width: 100%; height: 100%;">
                <embed src="${pdfUrl}" type="application/pdf" style="width: 100%; height: 100%;" />
                <div class="error-message">
                  <p>Your browser does not support PDF viewing.</p>
                  <p><a href="/api/documents/${id}/download" class="btn btn-primary" style="display: inline-block; margin-top: 12px;">Download PDF</a></p>
                </div>
              </object>`
            : document.documentType === 'image'
            ? `<img src="${document.thumbnailUrl || document.url}" alt="${document.title}" onclick="window.open('${document.url}', '_blank')" />`
            : `<div class="error-message">
                <p>Preview not available for ${document.documentType} files.</p>
                <p><a href="/api/documents/${id}/download">Click here to download</a> the file to view it.</p>
              </div>`
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

