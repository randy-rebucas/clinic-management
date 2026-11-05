import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import BackupRecord from '@/models/BackupRecord';
import { sizeLabel } from '@/lib/backups';

/** DELETE /api/backups/:id — clinic administrators only. Removes the copy stored in the app. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Only clinic administrators can delete backups', 'backups', 'write');

  try {
    const { id } = await params;
    if (!isValidId(id)) return notFound('Backup');
    await connectDB();

    const removed = await BackupRecord.findOneAndDelete({ _id: id, tenantId: tenantObjectId })
      .select('label sizeBytes createdAt')
      .lean<{ _id: Types.ObjectId; label?: string; sizeBytes?: number; createdAt: Date } | null>();
    if (!removed) return notFound('Backup');

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'delete',
      resource: 'system',
      resourceId: removed._id,
      description: `Deleted a backup${removed.label ? ` (${removed.label})` : ''} from ${removed.createdAt.toISOString().slice(0, 10)}: ${sizeLabel(removed.sizeBytes ?? 0)}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting backup:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete the backup' }, { status: 500 });
  }
}
