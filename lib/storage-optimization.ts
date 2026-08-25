/**
 * Storage Optimization Utilities
 * Automatic cleanup, compression, and bulk delete functionality
 *
 * Migrated off Mongoose. Every exported function receives an explicit
 * tenantId and self-wraps its Prisma calls in runWithTenant(tenantId, fn) —
 * same self-managing convention as lib/storage-tracking.ts — since callers
 * (app/api/storage/analytics, app/api/storage/cleanup) may not have already
 * established tenant context.
 *
 * NOTE (matches lib/storage-tracking.ts's precedent): PatientAttachment/
 * VisitAttachment/LabResultAttachment are pure child tables with no direct
 * tenantId column (see lib/prisma-tenant-extension.ts's DIRECTLY_SCOPED_MODELS
 * comment) — querying them directly is not tenant-scoped by the Prisma
 * extension. getStorageAnalytics() below reproduces that same limitation
 * rather than inventing a different, inconsistent join-based scoping scheme.
 */

import prisma from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant-context';
import { deleteFromCloudinary, extractPublicIdFromUrl } from '@/lib/cloudinary';

export interface StorageCleanupResult {
  success: boolean;
  deletedDocuments: number;
  deletedAttachments: number;
  freedBytes: number;
  freedGB: number;
  errors: string[];
}

export interface StorageAnalytics {
  totalFiles: number;
  totalBytes: number;
  totalGB: number;
  byType: {
    documents: { count: number; bytes: number };
    patientAttachments: { count: number; bytes: number };
    visitAttachments: { count: number; bytes: number };
    labResultAttachments: { count: number; bytes: number };
  };
  byAge: {
    recent: { count: number; bytes: number }; // < 30 days
    old: { count: number; bytes: number }; // 30-90 days
    veryOld: { count: number; bytes: number }; // > 90 days
  };
  byStatus: {
    active: { count: number; bytes: number };
    archived: { count: number; bytes: number };
    deleted: { count: number; bytes: number };
  };
}

/**
 * Clean up old/deleted files
 * Removes files older than specified days and deleted documents
 */
export async function cleanupOldFiles(
  tenantId: string,
  options: {
    deleteOlderThanDays?: number; // Delete files older than X days (default: 365)
    includeDeleted?: boolean; // Include files with status 'deleted' (default: true)
    dryRun?: boolean; // If true, don't actually delete, just report (default: false)
  } = {}
): Promise<StorageCleanupResult> {
  return runWithTenant(tenantId, () => cleanupOldFilesImpl(options));
}

async function cleanupOldFilesImpl(
  options: {
    deleteOlderThanDays?: number;
    includeDeleted?: boolean;
    dryRun?: boolean;
  } = {}
): Promise<StorageCleanupResult> {
  try {
    const {
      deleteOlderThanDays = 365,
      includeDeleted = true,
      dryRun = false,
    } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - deleteOlderThanDays);

    let deletedDocuments = 0;
    const deletedAttachments = 0;
    let freedBytes = 0;
    const errors: string[] = [];

    // Find old or deleted documents
    const documentsToDelete = await prisma.document.findMany({
      where: {
        OR: [
          { uploadDate: { lt: cutoffDate } },
          ...(includeDeleted ? [{ status: 'deleted' as const }] : []),
        ],
      },
      select: { id: true, url: true, metadata: true, size: true },
    });

    for (const doc of documentsToDelete) {
      try {
        const metadata = doc.metadata as { cloudinaryPublicId?: string } | null;

        // Delete from Cloudinary if applicable
        if (metadata?.cloudinaryPublicId) {
          if (!dryRun) {
            const deleteResult = await deleteFromCloudinary(metadata.cloudinaryPublicId);
            if (!deleteResult.success) {
              errors.push(`Failed to delete Cloudinary file: ${metadata.cloudinaryPublicId}`);
            }
          }
        } else if (doc.url && doc.url.includes('cloudinary.com')) {
          // Try to extract public ID from URL
          const publicId = extractPublicIdFromUrl(doc.url);
          if (publicId && !dryRun) {
            const deleteResult = await deleteFromCloudinary(publicId);
            if (!deleteResult.success) {
              errors.push(`Failed to delete Cloudinary file from URL: ${doc.url}`);
            }
          }
        }

        // Delete document from database
        if (!dryRun) {
          await prisma.document.delete({ where: { id: doc.id } });
        }

        deletedDocuments++;
        freedBytes += doc.size || 0;
      } catch (error: any) {
        errors.push(`Error deleting document ${doc.id}: ${error.message}`);
      }
    }

    // Clean up old attachments (this is more complex as they're separate child
    // tables). For now, we'll focus on documents. Attachments cleanup would
    // require deleting the child rows individually, which is more complex.

    const freedGB = freedBytes / (1024 * 1024 * 1024);

    return {
      success: errors.length === 0,
      deletedDocuments,
      deletedAttachments,
      freedBytes,
      freedGB: Math.round(freedGB * 100) / 100,
      errors,
    };
  } catch (error: any) {
    console.error('Error cleaning up old files:', error);
    return {
      success: false,
      deletedDocuments: 0,
      deletedAttachments: 0,
      freedBytes: 0,
      freedGB: 0,
      errors: [error.message || 'Unknown error'],
    };
  }
}

/**
 * Bulk delete files by IDs
 */
export async function bulkDeleteFiles(
  tenantId: string,
  documentIds: string[],
  options: {
    deleteFromCloudinary?: boolean; // Delete from Cloudinary too (default: true)
  } = {}
): Promise<StorageCleanupResult> {
  return runWithTenant(tenantId, () => bulkDeleteFilesImpl(documentIds, options));
}

async function bulkDeleteFilesImpl(
  documentIds: string[],
  options: {
    deleteFromCloudinary?: boolean;
  } = {}
): Promise<StorageCleanupResult> {
  try {
    const { deleteFromCloudinary: deleteFromCloud = true } = options;

    let deletedDocuments = 0;
    let freedBytes = 0;
    const errors: string[] = [];

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, url: true, metadata: true, size: true },
    });

    for (const doc of documents) {
      try {
        const metadata = doc.metadata as { cloudinaryPublicId?: string } | null;

        // Delete from Cloudinary if applicable
        if (deleteFromCloud) {
          if (metadata?.cloudinaryPublicId) {
            const deleteResult = await deleteFromCloudinary(metadata.cloudinaryPublicId);
            if (!deleteResult.success) {
              errors.push(`Failed to delete Cloudinary file: ${metadata.cloudinaryPublicId}`);
            }
          } else if (doc.url && doc.url.includes('cloudinary.com')) {
            const publicId = extractPublicIdFromUrl(doc.url);
            if (publicId) {
              const deleteResult = await deleteFromCloudinary(publicId);
              if (!deleteResult.success) {
                errors.push(`Failed to delete Cloudinary file from URL: ${doc.url}`);
              }
            }
          }
        }

        // Delete document from database
        await prisma.document.delete({ where: { id: doc.id } });

        deletedDocuments++;
        freedBytes += doc.size || 0;
      } catch (error: any) {
        errors.push(`Error deleting document ${doc.id}: ${error.message}`);
      }
    }

    const freedGB = freedBytes / (1024 * 1024 * 1024);

    return {
      success: errors.length === 0,
      deletedDocuments,
      deletedAttachments: 0,
      freedBytes,
      freedGB: Math.round(freedGB * 100) / 100,
      errors,
    };
  } catch (error: any) {
    console.error('Error bulk deleting files:', error);
    return {
      success: false,
      deletedDocuments: 0,
      deletedAttachments: 0,
      freedBytes: 0,
      freedGB: 0,
      errors: [error.message || 'Unknown error'],
    };
  }
}

/**
 * Get storage analytics and trends
 */
export async function getStorageAnalytics(tenantId: string): Promise<StorageAnalytics> {
  return runWithTenant(tenantId, () => getStorageAnalyticsImpl());
}

async function getStorageAnalyticsImpl(): Promise<StorageAnalytics> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get all documents (tenant-scoped by the Prisma extension)
    const documents = await prisma.document.findMany({
      select: { size: true, uploadDate: true, status: true },
    });

    // Get attachments from other models (see file-header note: these child
    // tables have no direct tenantId column, so this is not tenant-scoped —
    // matches lib/storage-tracking.ts's calculateStorageUsage precedent)
    const [patientAttachments, visitAttachments, labResultAttachments] = await Promise.all([
      prisma.patientAttachment.findMany({ select: { size: true } }),
      prisma.visitAttachment.findMany({ select: { size: true } }),
      prisma.labResultAttachment.findMany({ select: { size: true } }),
    ]);

    // Calculate totals
    let totalFiles = 0;
    let totalBytes = 0;

    // Documents
    const documentsBytes = documents.reduce((sum, doc) => sum + (doc.size || 0), 0);
    totalFiles += documents.length;
    totalBytes += documentsBytes;

    // Patient attachments
    const patientAttachmentsBytes = patientAttachments.reduce((sum, a) => sum + (a.size || 0), 0);
    const patientAttachmentsCount = patientAttachments.length;
    totalFiles += patientAttachmentsCount;
    totalBytes += patientAttachmentsBytes;

    // Visit attachments
    const visitAttachmentsBytes = visitAttachments.reduce((sum, a) => sum + (a.size || 0), 0);
    const visitAttachmentsCount = visitAttachments.length;
    totalFiles += visitAttachmentsCount;
    totalBytes += visitAttachmentsBytes;

    // LabResult attachments
    const labResultAttachmentsBytes = labResultAttachments.reduce((sum, a) => sum + (a.size || 0), 0);
    const labResultAttachmentsCount = labResultAttachments.length;
    totalFiles += labResultAttachmentsCount;
    totalBytes += labResultAttachmentsBytes;

    // Calculate by age
    const recent = documents.filter((d) => d.uploadDate && new Date(d.uploadDate) >= thirtyDaysAgo);
    const old = documents.filter((d) => {
      const uploadDate = d.uploadDate ? new Date(d.uploadDate) : null;
      return uploadDate && uploadDate >= ninetyDaysAgo && uploadDate < thirtyDaysAgo;
    });
    const veryOld = documents.filter((d) => {
      const uploadDate = d.uploadDate ? new Date(d.uploadDate) : null;
      return uploadDate && uploadDate < ninetyDaysAgo;
    });

    // Calculate by status
    const active = documents.filter((d) => d.status === 'active');
    const archived = documents.filter((d) => d.status === 'archived');
    const deleted = documents.filter((d) => d.status === 'deleted');

    return {
      totalFiles,
      totalBytes,
      totalGB: Math.round((totalBytes / (1024 * 1024 * 1024)) * 100) / 100,
      byType: {
        documents: {
          count: documents.length,
          bytes: documentsBytes,
        },
        patientAttachments: {
          count: patientAttachmentsCount,
          bytes: patientAttachmentsBytes,
        },
        visitAttachments: {
          count: visitAttachmentsCount,
          bytes: visitAttachmentsBytes,
        },
        labResultAttachments: {
          count: labResultAttachmentsCount,
          bytes: labResultAttachmentsBytes,
        },
      },
      byAge: {
        recent: {
          count: recent.length,
          bytes: recent.reduce((sum, d) => sum + (d.size || 0), 0),
        },
        old: {
          count: old.length,
          bytes: old.reduce((sum, d) => sum + (d.size || 0), 0),
        },
        veryOld: {
          count: veryOld.length,
          bytes: veryOld.reduce((sum, d) => sum + (d.size || 0), 0),
        },
      },
      byStatus: {
        active: {
          count: active.length,
          bytes: active.reduce((sum, d) => sum + (d.size || 0), 0),
        },
        archived: {
          count: archived.length,
          bytes: archived.reduce((sum, d) => sum + (d.size || 0), 0),
        },
        deleted: {
          count: deleted.length,
          bytes: deleted.reduce((sum, d) => sum + (d.size || 0), 0),
        },
      },
    };
  } catch (error: any) {
    console.error('Error getting storage analytics:', error);
    throw error;
  }
}
