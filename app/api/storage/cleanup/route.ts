import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { retryPendingFileRemovals, bulkDeleteFiles } from '@/lib/storage-optimization';
import { createAuditLog } from '@/lib/audit';

const cleanupSchema = z.object({
  dryRun: z.boolean().optional(),
  documentIds: z.array(zObjectId).min(1).max(500).optional(),
});

/**
 * Storage cleanup. Admin only.
 * POST /api/storage/cleanup
 *
 * - `{ documentIds }`: delete those documents. Each record stays, marked deleted, and its file
 *   is removed, exactly as deleting from the document page.
 * - otherwise: remove the stored files of already-deleted documents whose removal failed
 *   earlier (`dryRun` only counts them). Medical records are never erased here.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Admin access required for storage cleanup');
  }

  const parsed = await parseBody(request, cleanupSchema);
  if (isValidationError(parsed)) return parsed;
  const { dryRun = false, documentIds } = parsed.data;

  try {
    await connectDB();

    const result = documentIds
      ? await bulkDeleteFiles(ctx.tenantId, documentIds, ctx.session.userId)
      : await retryPendingFileRemovals(ctx.tenantId, { dryRun });

    if (result.errors.length) {
      console.error('Storage cleanup errors:', result.errors);
    }

    if (result.deleted.length) {
      const { session, tenantId } = ctx;
      after(() =>
        Promise.all(
          result.deleted.map((doc) =>
            createAuditLog({
              userId: session.userId,
              userEmail: session.email,
              userRole: session.role,
              tenantId,
              action: 'delete',
              resource: 'document',
              resourceId: doc._id,
              dataSubject: doc.patient,
              isSensitive: Boolean(doc.patient),
              description: `Deleted document ${doc.documentCode ?? doc._id} and its file (bulk delete)`,
            })
          )
        )
      );
    }

    const { deleted: _deleted, errors, ...summary } = result;
    return NextResponse.json({
      success: result.success,
      data: {
        ...summary,
        errors: errors.length ? [`${errors.length} item(s) could not be cleaned up; they stay marked and the next cleanup tries again`] : [],
      },
      message: documentIds
        ? `Deleted ${result.deletedDocuments} documents, freed ${result.freedGB.toFixed(2)} GB`
        : dryRun
          ? `${result.filesPending} stored file(s) of deleted documents still to remove. Nothing was changed.`
          : `Removed ${result.filesRemoved} stored file(s) of deleted documents${result.filesPending ? `; ${result.filesPending} still pending` : ''}`,
    });
  } catch (error) {
    console.error('Error cleaning up storage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cleanup storage' },
      { status: 500 }
    );
  }
}
