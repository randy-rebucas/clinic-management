import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { cleanupOldFiles, bulkDeleteFiles } from '@/lib/storage-optimization';

const cleanupSchema = z.object({
  // A floor prevents an accidental 0/negative value from wiping every document.
  deleteOlderThanDays: z.number().int().min(30).max(36500).optional(),
  includeDeleted: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  documentIds: z.array(zObjectId).min(1).max(500).optional(),
});

/**
 * Clean up old files. Admin only.
 * POST /api/storage/cleanup
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Admin access required for storage cleanup');
  }

  const parsed = await parseBody(request, cleanupSchema);
  if (isValidationError(parsed)) return parsed;
  const {
    deleteOlderThanDays = 365,
    includeDeleted = true,
    dryRun = false,
    documentIds,
  } = parsed.data;

  try {
    await connectDB();

    const result = documentIds
      ? await bulkDeleteFiles(ctx.tenantId, documentIds, { deleteFromCloudinary: true })
      : await cleanupOldFiles(ctx.tenantId, { deleteOlderThanDays, includeDeleted, dryRun });

    if (result.errors?.length) {
      console.error('Storage cleanup errors:', result.errors);
    }

    return NextResponse.json({
      success: result.success,
      data: {
        ...result,
        errors: result.errors?.length ? [`${result.errors.length} item(s) could not be deleted`] : [],
      },
      message: dryRun && !documentIds
        ? 'Dry run completed. No files were deleted.'
        : `Cleaned up ${result.deletedDocuments} documents, freed ${result.freedGB.toFixed(2)} GB`,
    });
  } catch (error) {
    console.error('Error cleaning up storage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cleanup storage' },
      { status: 500 }
    );
  }
}
