import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { cleanupOldFiles, bulkDeleteFiles } from '@/lib/storage-optimization';

/**
 * Clean up old files
 * POST /api/storage/cleanup
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can cleanup storage
  const permissionCheck = await requirePermission(session, 'settings', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      deleteOlderThanDays = 365,
      includeDeleted = true,
      dryRun = false,
      documentIds, // For bulk delete
    } = body;

    let result;

    if (documentIds && Array.isArray(documentIds)) {
      // Bulk delete specific documents
      result = await bulkDeleteFiles(tenantId, documentIds, {
        deleteFromCloudinary: true,
      });
    } else {
      // Cleanup old files
      result = await cleanupOldFiles(tenantId, {
        deleteOlderThanDays,
        includeDeleted,
        dryRun,
      });
    }

    return NextResponse.json({
      success: result.success,
      data: result,
      message: dryRun 
        ? 'Dry run completed. No files were deleted.' 
        : `Cleaned up ${result.deletedDocuments} documents, freed ${result.freedGB.toFixed(2)} GB`,
    });
  } catch (error: any) {
    console.error('Error cleaning up storage:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to cleanup storage' },
      { status: 500 }
    );
  }
}

