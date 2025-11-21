import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { extractTextFromDocument } from '@/lib/document-utils';

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
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
      const document = await Document.findByIdAndUpdate(
        documentId,
        {
          scanned: true,
          ocrText: ocrText || undefined,
          lastModifiedBy: session.userId,
          lastModifiedDate: new Date(),
        },
        { new: true }
      );

      if (!document) {
        return NextResponse.json(
          { success: false, error: 'Document not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          document,
          ocrText,
          scanned: true,
        },
      });
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

