import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLogArchive from '@/models/AuditLogArchive';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { AUDIT_ARCHIVE_DEFAULTS, isArchiveStorageConfigured } from '@/lib/audit-archive';

/**
 * The clinic's archived audit log months (moved out of the database by lib/audit-archive.ts).
 * GET /api/audit-logs/archives
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;
  if (!isAdmin(session)) {
    return refuseAccess(session, 'Only clinic administrators can read the audit log', 'audit-log');
  }

  try {
    await connectDB();
    const archives = await AuditLogArchive.find({ tenantId: tenantObjectId })
      .select('month entries bytes firstAt lastAt createdAt')
      .sort({ month: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        archives: archives.map((a) => ({
          id: String(a._id),
          month: a.month,
          entries: a.entries,
          bytes: a.bytes,
          firstAt: a.firstAt,
          lastAt: a.lastAt,
          archivedAt: a.createdAt,
        })),
        keepInDatabaseDays: AUDIT_ARCHIVE_DEFAULTS.keepInDatabaseDays,
        keepArchiveDays: AUDIT_ARCHIVE_DEFAULTS.keepArchiveDays,
        storageConfigured: isArchiveStorageConfigured(),
      },
    });
  } catch (error) {
    console.error('Error listing audit log archives:', error);
    return NextResponse.json({ success: false, error: 'Failed to list audit log archives' }, { status: 500 });
  }
}
