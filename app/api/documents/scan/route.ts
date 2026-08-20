import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { extractTextFromDocument } from '@/lib/document-utils';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { markDocumentScanned } from '@/lib/data/document';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentId = formData.get('documentId') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Extract text using OCR (placeholder - implement actual OCR)
    const ocrText = await extractTextFromDocument(file);

    // If documentId provided, update existing document
    if (documentId) {
      const tenantContext = await getTenantContext();
      const tenantId = session.tenantId || tenantContext.tenantId;

      try {
        const document = await run(tenantId, () => markDocumentScanned(documentId, ocrText || undefined, session.userId));

        return NextResponse.json({
          success: true,
          data: {
            document,
            ocrText,
            scanned: true,
          },
        });
      } catch (error: any) {
        if (error.code === 'P2025') {
          return NextResponse.json(
            { success: false, error: 'Document not found' },
            { status: 404 }
          );
        }
        throw error;
      }
    }

    // Otherwise, return OCR result for new document creation
    return NextResponse.json({
      success: true,
      data: {
        ocrText,
        scanned: true,
      },
    });
  } catch (error: any) {
    console.error('Error scanning document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to scan document' },
      { status: 500 }
    );
  }
}
