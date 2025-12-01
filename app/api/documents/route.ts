import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getDocumentType, inferDocumentCategory, validateFile } from '@/lib/document-utils';
import { uploadDocumentToCloudinary, getThumbnailUrl, isCloudinaryConfigured } from '@/lib/cloudinary';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const category = searchParams.get('category');
    const documentType = searchParams.get('documentType');
    const status = searchParams.get('status') || 'active';
    const search = searchParams.get('search');
    const visitId = searchParams.get('visitId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query: any = { status };

    // Filter by patient (users can only see documents for patients they have access to)
    if (patientId) {
      query.patient = patientId;
    }

    if (category) {
      query.category = category;
    }

    if (documentType) {
      query.documentType = documentType;
    }

    if (visitId) {
      query.visit = visitId;
    }

    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    const documents = await Document.find(query)
      .populate('patient', 'firstName lastName patientCode')
      .populate('uploadedBy', 'name')
      .populate('visit', 'visitCode date')
      .sort({ uploadDate: -1 })
      .limit(limit);

    // Get total count for pagination
    const total = await Document.countDocuments(query);

    return NextResponse.json({
      success: true,
      data: documents,
      total,
    });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string;
    const patientId = formData.get('patientId') as string;
    const visitId = formData.get('visitId') as string | null;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string | null;
    const tags = formData.get('tags') as string | null;
    const notes = formData.get('notes') as string | null;
    const scanned = formData.get('scanned') === 'true';

    // Additional metadata based on category
    const referralData = formData.get('referralData') ? JSON.parse(formData.get('referralData') as string) : null;
    const imagingData = formData.get('imagingData') ? JSON.parse(formData.get('imagingData') as string) : null;
    const medicalCertificateData = formData.get('medicalCertificateData') ? JSON.parse(formData.get('medicalCertificateData') as string) : null;
    const labResultData = formData.get('labResultData') ? JSON.parse(formData.get('labResultData') as string) : null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validateFile(file, 10); // 10MB max
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Determine document type and category
    const documentType = getDocumentType(file.name, file.type);
    const inferredCategory = inferDocumentCategory(file.name, category || undefined);
    const finalCategory = category || inferredCategory;

    // Upload to Cloudinary (or fallback to base64 if not configured)
    let fileUrl: string;
    let thumbnailUrl: string | undefined;
    let cloudinaryPublicId: string | undefined;

    if (isCloudinaryConfigured()) {
      // Upload to Cloudinary
      const uploadResult = await uploadDocumentToCloudinary(
        file,
        finalCategory,
        patientId || undefined,
        {
          resourceType: documentType === 'image' ? 'image' : documentType === 'pdf' ? 'raw' : 'auto',
          tags: tags ? tags.split(',').map(t => t.trim()) : [],
        }
      );

      if (!uploadResult.success || !uploadResult.data) {
        return NextResponse.json(
          { success: false, error: uploadResult.error || 'Failed to upload to Cloudinary' },
          { status: 500 }
        );
      }

      fileUrl = uploadResult.data.secure_url;
      cloudinaryPublicId = uploadResult.data.public_id;

      // Generate thumbnail for images
      if (documentType === 'image' && uploadResult.data.public_id) {
        thumbnailUrl = getThumbnailUrl(uploadResult.data.public_id, 300);
      }
    } else {
      // Fallback to base64 storage if Cloudinary not configured
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = buffer.toString('base64');
      fileUrl = `data:${file.type};base64,${base64}`;
    }

    // Generate unique document code
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const documentCode = `DOC-${Date.now()}-${randomSuffix}`;

    // Build document object
    const documentData: any = {
      documentCode,
      title: title || file.name,
      description: description || undefined,
      category: finalCategory,
      documentType,
      filename: file.name,
      originalFilename: file.name,
      contentType: file.type,
      size: file.size,
      url: fileUrl,
      thumbnailUrl: thumbnailUrl || undefined,
      scanned,
      uploadedBy: session.userId,
      uploadDate: new Date(),
      status: 'active',
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      notes: notes || undefined,
      // Store Cloudinary public ID in metadata for future operations
      metadata: cloudinaryPublicId ? { cloudinaryPublicId } : undefined,
    };

    // Add relationships
    if (patientId) documentData.patient = patientId;
    if (visitId) documentData.visit = visitId;

    // Add category-specific data
    if (category === 'referral' && referralData) {
      documentData.referral = referralData;
    }
    if (category === 'imaging' && imagingData) {
      documentData.imaging = imagingData;
    }
    if (category === 'medical_certificate' && medicalCertificateData) {
      documentData.medicalCertificate = medicalCertificateData;
    }
    if (category === 'laboratory_result' && labResultData) {
      documentData.labResultMetadata = labResultData;
    }

    const document = await Document.create(documentData);
    await document.populate('patient', 'firstName lastName patientCode');
    await document.populate('uploadedBy', 'name');

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating document:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Document code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create document' },
      { status: 500 }
    );
  }
}

