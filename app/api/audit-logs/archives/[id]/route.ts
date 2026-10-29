import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLogArchive from '@/models/AuditLogArchive';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { readAuditArchive } from '@/lib/audit-archive';
import { createAuditLog } from '@/lib/audit';

/**
 * Download one archived audit log month: gzipped JSON lines, one entry per line, in canonical
 * Extended JSON (the database backup format).
 * GET /api/audit-logs/archives/:id
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;
  if (!isAdmin(session)) {
    return refuseAccess(session, 'Only clinic administrators can read the audit log', 'audit-log');
  }

  const { id } = await params;
  if (!isValidId(id)) return notFound('Archive');

  try {
    await connectDB();
    const archive = await AuditLogArchive.findOne({ _id: id, tenantId: tenantObjectId })
      .select('month pathname entries')
      .lean();
    if (!archive) return notFound('Archive');

    const file = await readAuditArchive(archive);
    if (!file) {
      return NextResponse.json({ success: false, error: 'The archive file could not be read' }, { status: 502 });
    }

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'download',
      resource: 'system',
      resourceId: id,
      description: `Downloaded the archived audit log for ${archive.month} (${archive.entries} entries)`,
    });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="audit-log-${archive.month}.jsonl.gz"`,
        'Content-Length': String(file.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error downloading audit log archive:', error);
    return NextResponse.json({ success: false, error: 'Failed to download the archive' }, { status: 500 });
  }
}
