import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getDocumentType, inferDocumentCategory, validateFile } from '@/lib/document-utils';
import { uploadDocumentToCloudinary, getThumbnailUrl, isCloudinaryConfigured } from '@/lib/cloudinary';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { buildDocumentWhere, listDocuments, createDocument, DocumentParentError } from '@/lib/data/document';
import { getPatientById } from '@/lib/data/patient';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

class ValidationError extends Error {}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read documents (using patients permission as documents are patient-related)
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const category = searchParams.get('category');
    const documentType = searchParams.get('documentType');
    const status = searchParams.get('status') || 'active';
    const search = searchParams.get('search');
    const visitId = searchParams.get('visitId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where = buildDocumentWhere({
      patientId: patientId || undefined,
      category: category || undefined,
      documentType: documentType || undefined,
      status: status || undefined,
      visitId: visitId || undefined,
      search: search || undefined,
    });

    const { items, total } = await run(tenantId, () => listDocuments(where, limit));

    return NextResponse.json({
      success: true,
      data: items,
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

  // Check permission to write documents (using patients permission as documents are patient-related)
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
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

    // Get tenant context from session or headers
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

    const document = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      if (patientId && tenantId) {
        const patient = await runAsSystem(() => getPatientById(patientId));
        const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
        if (!belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }

      const documentData: Record<string, any> = {
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
        uploadedById: session.userId,
        uploadDate: new Date(),
        status: 'active',
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        notes: notes || undefined,
        metadata: cloudinaryPublicId ? { cloudinaryPublicId } : undefined,
      };

      if (patientId) documentData.patientId = patientId;
      if (visitId) documentData.visitId = visitId;

      if (category === 'referral' && referralData) documentData.referral = referralData;
      if (category === 'imaging' && imagingData) documentData.imaging = imagingData;
      if (category === 'medical_certificate' && medicalCertificateData) documentData.medicalCertificate = medicalCertificateData;
      if (category === 'laboratory_result' && labResultData) documentData.labResultMetadata = labResultData;

      return createDocument(documentData as any);
    });

    return NextResponse.json({ success: true, data: document }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating document:', error);
    if (error instanceof ValidationError || error instanceof DocumentParentError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error.code === 'P2002') {
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
