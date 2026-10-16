import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getDocumentType, inferDocumentCategory } from '@/lib/document-utils';
import { uploadDocumentToCloudinary, isCloudinaryConfigured } from '@/lib/cloudinary';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { validateUpload, DOCUMENT_UPLOAD_TYPES, MAX_INLINE_UPLOAD_BYTES } from '@/lib/upload-validation';
import { withStreamUrls } from '@/lib/document-file';
import {
  DOCUMENT_CATEGORIES,
  referralMetaSchema,
  imagingMetaSchema,
  medicalCertificateMetaSchema,
  labResultMetaSchema,
} from '@/lib/document-schema';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  // Check permission to read documents (using patients permission as documents are patient-related)
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
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
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);

    const query: any = {
      tenantId: tenantObjectId,
      status: ['active', 'archived'].includes(status) ? status : 'active',
    };

    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [], total: 0 });
      query.patient = new Types.ObjectId(patientId);
    }
    if (category) query.category = String(category);
    if (documentType) query.documentType = String(documentType);
    if (visitId) {
      if (!isValidId(visitId)) return NextResponse.json({ success: true, data: [], total: 0 });
      query.visit = new Types.ObjectId(visitId);
    }
    if (search) {
      query.$text = { $search: search.slice(0, 200) };
    }

    const [documents, total] = await Promise.all([
      Document.find(query)
        .select('-ocrText')
        .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } })
        .populate('uploadedBy', 'name')
        .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } })
        .sort({ uploadDate: -1 })
        .limit(limit)
        .lean(),
      Document.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: documents.map((d: any) => withStreamUrls(d)),
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

function parseJsonField<T extends z.ZodType>(raw: FormDataEntryValue | null, schema: T): z.infer<T> | null | 'invalid' {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : 'invalid';
  } catch {
    return 'invalid';
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  // Check permission to write documents (using patients permission as documents are patient-related)
  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const formData = await request.formData();
    const str = (key: string, max = 500) => {
      const v = formData.get(key);
      return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
    };
    const file = formData.get('file');
    const category = str('category', 50);
    const patientId = str('patientId', 24);
    const visitId = str('visitId', 24);
    const title = str('title', 300);
    const description = str('description', 5000);
    const tagsRaw = str('tags', 2000);
    const notes = str('notes', 5000);
    const scanned = formData.get('scanned') === 'true';

    if (category && !(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const referralData = parseJsonField(formData.get('referralData'), referralMetaSchema);
    const imagingData = parseJsonField(formData.get('imagingData'), imagingMetaSchema);
    const medicalCertificateData = parseJsonField(formData.get('medicalCertificateData'), medicalCertificateMetaSchema);
    const labResultData = parseJsonField(formData.get('labResultData'), labResultMetaSchema);
    if ([referralData, imagingData, medicalCertificateData, labResultData].includes('invalid')) {
      return NextResponse.json({ success: false, error: 'Invalid document metadata' }, { status: 400 });
    }

    const useCloudinary = isCloudinaryConfigured();
    const check = await validateUpload(file instanceof File ? file : null, {
      allowed: DOCUMENT_UPLOAD_TYPES,
      // Inline (MongoDB) storage is limited by the document size cap.
      maxBytes: useCloudinary ? MAX_DOCUMENT_BYTES : MAX_INLINE_UPLOAD_BYTES,
    });
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    if (patientId) {
      if (!isValidId(patientId) || !(await Patient.exists({ _id: patientId, tenantIds: tenantObjectId }))) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }
    if (visitId) {
      if (!isValidId(visitId) || !(await Visit.exists({ _id: visitId, tenantId: tenantObjectId }))) {
        return NextResponse.json({ success: false, error: 'Invalid visit' }, { status: 400 });
      }
    }

    // Storage limit is checked before anything is uploaded.
    const { checkStorageLimit } = await import('@/lib/storage-tracking');
    const storageCheck = await checkStorageLimit(tenantId, check.buffer.length);
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

    const documentType = getDocumentType(check.filename, check.contentType);
    const finalCategory = category || inferDocumentCategory(check.filename, undefined);
    const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim().slice(0, 50)).filter(Boolean).slice(0, 50) : [];

    let fileUrl: string;
    let cloudinaryMeta: Record<string, string> | undefined;

    if (useCloudinary) {
      const uploadFile = new File([new Uint8Array(check.buffer)], check.filename, { type: check.contentType });
      const uploadResult = await uploadDocumentToCloudinary(uploadFile, finalCategory, tenantId, {
        resourceType: documentType === 'image' ? 'image' : 'raw',
        contentType: check.contentType,
        tags,
      });

      if (!uploadResult.success || !uploadResult.data) {
        return NextResponse.json(
          { success: false, error: 'Failed to upload file' },
          { status: 502 }
        );
      }

      fileUrl = uploadResult.data.secure_url;
      cloudinaryMeta = {
        cloudinaryPublicId: uploadResult.data.public_id,
        cloudinaryResourceType: uploadResult.data.resource_type,
        cloudinaryDeliveryType: uploadResult.data.type,
        ...(uploadResult.data.format ? { cloudinaryFormat: uploadResult.data.format } : {}),
      };
    } else {
      fileUrl = `data:${check.contentType};base64,${check.buffer.toString('base64')}`;
    }

    const seq = await nextSequence(
      tenantObjectId,
      'document',
      maxCodeSeed(Document, 'documentCode', { tenantId: tenantObjectId, documentCode: { $regex: /^DOC-\d{1,9}$/ } })
    );

    const documentData: any = {
      tenantId: tenantObjectId,
      documentCode: formatCode('DOC', seq),
      title: title || check.filename,
      description,
      category: finalCategory,
      documentType,
      filename: check.filename,
      originalFilename: check.filename,
      contentType: check.contentType,
      size: check.buffer.length,
      url: fileUrl,
      scanned,
      uploadedBy: session.userId,
      uploadDate: new Date(),
      status: 'active',
      tags,
      notes,
      metadata: cloudinaryMeta,
    };

    if (patientId) documentData.patient = new Types.ObjectId(patientId);
    if (visitId) documentData.visit = new Types.ObjectId(visitId);

    if (finalCategory === 'referral' && referralData) documentData.referral = referralData;
    if (finalCategory === 'imaging' && imagingData) documentData.imaging = imagingData;
    if (finalCategory === 'medical_certificate' && medicalCertificateData) documentData.medicalCertificate = medicalCertificateData;
    if (finalCategory === 'laboratory_result' && labResultData) documentData.labResultMetadata = labResultData;

    const document = await Document.create(documentData);

    await document.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await document.populate('uploadedBy', 'name');

    return NextResponse.json({ success: true, data: withStreamUrls(document.toObject()) }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating document:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid document data' },
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
