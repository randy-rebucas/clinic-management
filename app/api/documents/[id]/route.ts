import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Appointment from '@/models/Appointment';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updateDocumentSchema } from '@/lib/document-schema';
import { cloudinaryRefForDocument, withStreamUrls } from '@/lib/document-file';
import { createAuditLog } from '@/lib/audit';
import { Types } from 'mongoose';

function populateFor(tenantObjectId: Types.ObjectId) {
  const same = { tenantId: tenantObjectId };
  return [
    { path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } },
    { path: 'uploadedBy', select: 'name' },
    { path: 'visit', select: 'visitCode date', match: same },
    { path: 'appointment', select: 'appointmentCode', match: same },
    { path: 'labResult', select: 'requestCode', match: same },
    { path: 'invoice', select: 'invoiceNumber', match: same },
  ];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'documents', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Document');

    // The file itself is never sent here (inline files are whole data URLs); it streams from
    // /stream, which records who opened it.
    const document = await Document.findOne(tenantFilter(ctx.tenantId, { _id: id, status: { $ne: 'deleted' } }))
      .select('-ocrText -url -metadata')
      .populate(populateFor(ctx.tenantObjectId))
      .lean();

    if (!document) return notFound('Document');

    return NextResponse.json({ success: true, data: withStreamUrls(document as any) });
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
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'documents', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Document');

    const parsed = await parseBody(request, updateDocumentSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    // Linked records must belong to this clinic.
    const refChecks: Array<[unknown, () => Promise<unknown>]> = [
      [body.patient, () => Patient.exists({ _id: body.patient, tenantIds: tenantObjectId })],
      [body.visit, () => Visit.exists({ _id: body.visit, tenantId: tenantObjectId })],
      [body.appointment, () => Appointment.exists({ _id: body.appointment, tenantId: tenantObjectId })],
      [body.labResult, () => LabResult.exists({ _id: body.labResult, tenantId: tenantObjectId })],
      [body.invoice, () => Invoice.exists({ _id: body.invoice, tenantId: tenantObjectId })],
    ];
    for (const [value, check] of refChecks) {
      if (value && !(await check())) {
        return NextResponse.json({ success: false, error: 'Linked record not found' }, { status: 400 });
      }
    }

    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      if (value === null) unset[key] = 1;
      else set[key] = value;
    }
    // A certificate's "valid until" is the document's expiry, so expiry alerts follow an edit.
    if (body.medicalCertificate && body.expiryDate === undefined) {
      if (body.medicalCertificate.validUntil) set.expiryDate = new Date(body.medicalCertificate.validUntil);
      else if (body.medicalCertificate.validUntil === null) unset.expiryDate = 1;
    }
    // Moving a document to another patient drops a visit that belonged to the old one.
    if (body.patient !== undefined && body.visit === undefined) {
      const current = await Document.findOne(tenantFilter(tenantId, { _id: id })).select('patient').lean<{ patient?: unknown } | null>();
      if (current && String(current.patient ?? '') !== String(body.patient ?? '')) unset.visit = 1;
    }
    set.lastModifiedBy = session.userId;
    set.lastModifiedDate = new Date();

    const document = await Document.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id, status: { $ne: 'deleted' } }),
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true }
    )
      .select('-ocrText')
      .populate(populateFor(tenantObjectId))
      .lean();

    if (!document) return notFound('Document');

    after(() => createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'update',
      resource: 'document',
      resourceId: id,
      dataSubject: (document as any).patient?._id,
      changes: Object.keys(body).map((field) => ({ field, newValue: field === 'notes' || field === 'description' ? '(changed)' : (body as Record<string, unknown>)[field] })),
      description: `Updated document ${(document as any).documentCode}`,
    }));

    return NextResponse.json({ success: true, data: withStreamUrls(document as any) });
  } catch (error: any) {
    console.error('Error updating document:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid document data' },
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
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Soft delete; default staff roles only hold read/write/update on documents.
  const permissionCheck = await requirePermission(session, 'documents', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Document');

    const query = tenantFilter(tenantId, { _id: id });
    const document = await Document.findOne(query).lean() as any;
    if (!document) return notFound('Document');

    const ref = cloudinaryRefForDocument(document);
    if (ref) {
      await deleteFromCloudinary(ref.publicId, { resourceType: ref.resourceType, deliveryType: ref.deliveryType });
    }

    // The record stays for the audit trail, but the file goes: a Cloudinary file is deleted above,
    // and an inline file (stored in this record as a data URL) is wiped here, with any OCR text.
    const deletedDocument = await Document.findOneAndUpdate(
      query,
      {
        $set: { status: 'deleted', url: 'removed:', lastModifiedBy: session.userId, lastModifiedDate: new Date() },
        $unset: { ocrText: 1, thumbnailUrl: 1 },
      },
      { new: true }
    ).select('_id documentCode status').lean();

    after(() => createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'delete',
      resource: 'document',
      resourceId: id,
      dataSubject: document.patient,
      isSensitive: Boolean(document.patient),
      description: `Deleted document ${document.documentCode} and its file`,
    }));

    return NextResponse.json({ success: true, data: deletedDocument });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}
