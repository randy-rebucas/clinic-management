import { gzipSync } from 'zlib';
import { NextRequest, NextResponse } from 'next/server';
import mongoose, { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import BackupRecord from '@/models/BackupRecord';

const { EJSON } = mongoose.mongo.BSON;

type StoredBackup = {
  _id: Types.ObjectId;
  label?: string;
  createdAt: Date;
  version?: string;
  collections?: string[];
  counts?: Record<string, number>;
  totalDocuments?: number;
  data: unknown;
};

/**
 * GET /api/backups/:id/download — clinic administrators only. One backup as gzipped canonical
 * Extended JSON, which keeps ids and dates exact. Gzipped because a backup can be up to 12 MB and
 * hosted function responses are limited to less.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Only clinic administrators can download backups', 'backups');

  try {
    const { id } = await params;
    if (!isValidId(id)) return notFound('Backup');
    await connectDB();

    const backup = await BackupRecord.findOne({ _id: id, tenantId: tenantObjectId }).lean<StoredBackup | null>();
    if (!backup) return notFound('Backup');

    const { _id, label, createdAt, version, collections, counts, totalDocuments, data } = backup;
    const file = gzipSync(
      EJSON.stringify({ id: String(_id), label, createdAt, version, collections, counts, totalDocuments, data }, { relaxed: false })
    );

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'download',
      resource: 'system',
      resourceId: _id,
      isSensitive: true,
      description: `Downloaded a backup${label ? ` (${label})` : ''} from ${createdAt.toISOString().slice(0, 10)}`,
    });

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="backup-${createdAt.toISOString().slice(0, 10)}.json.gz"`,
        'Content-Length': String(file.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error downloading backup:', error);
    return NextResponse.json({ success: false, error: 'Failed to download the backup' }, { status: 500 });
  }
}
