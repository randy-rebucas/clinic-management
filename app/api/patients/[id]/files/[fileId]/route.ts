import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { Types } from 'mongoose';
import { INLINE_SAFE_TYPES } from '@/lib/upload-validation';
import { createAuditLog } from '@/lib/audit';

/**
 * Serve one of the patient's files. Files are stored inline as data URLs, which a browser
 * refuses to open as a page, so they are streamed from here: shown in the tab when the type
 * is safe to render (images, PDF, text), otherwise downloaded (`?download=1` always downloads).
 * Each opening is audit-logged against the patient.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return notFound('File');

    const patient = (await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id }), { attachments: { $elemMatch: { _id: new Types.ObjectId(fileId) } } }).lean()) as {
      attachments?: { filename?: string; contentType?: string; url?: string }[];
    } | null;
    const file = patient?.attachments?.[0];
    if (!file?.url) return notFound('File');

    const download = request.nextUrl.searchParams.get('download') === '1';
    void createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: download ? 'download' : 'view',
      resource: 'document',
      resourceId: fileId,
      dataSubject: id,
      isSensitive: true,
      description: `Opened patient file ${file.filename ?? fileId}`,
    });

    const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(file.url);
    if (!m) {
      // Older files kept at an external store.
      return /^https:\/\//.test(file.url) ? NextResponse.redirect(file.url) : notFound('File');
    }
    const type = m[1].toLowerCase();
    const inline = !download && INLINE_SAFE_TYPES.has(type);
    const name = (file.filename || 'file').replace(/["\r\n]/g, '');
    return new NextResponse(new Uint8Array(Buffer.from(m[2], 'base64')), {
      headers: {
        'Content-Type': inline ? type : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'X-Content-Type-Options': 'nosniff',
        // Browsers refuse to show a PDF in a sandboxed document, so only other types get the sandbox.
        ...(type === 'application/pdf' ? {} : { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" }),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error serving patient file:', error);
    return NextResponse.json({ success: false, error: 'Failed to open the file' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, fileId } = await params;
    if (!isValidId(id) || !isValidId(fileId)) return notFound('Patient');

    const patient = await Patient.findOneAndUpdate(
      patientTenantFilter(ctx.tenantId, { _id: id }),
      { $pull: { attachments: { _id: new Types.ObjectId(fileId) } } },
      { new: true }
    );

    if (!patient) return notFound('Patient');

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
