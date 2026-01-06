/**
 * Storage Optimization Utilities
 * Automatic cleanup, compression, and bulk delete functionality
 */

import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import { Types } from 'mongoose';
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
  tenantId: string | Types.ObjectId,
  options: {
    deleteOlderThanDays?: number; // Delete files older than X days (default: 365)
    includeDeleted?: boolean; // Include files with status 'deleted' (default: true)
    dryRun?: boolean; // If true, don't actually delete, just report (default: false)
  } = {}
): Promise<StorageCleanupResult> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

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
    const query: any = {
      tenantId: tenantIdObj,
      $or: [
        { uploadDate: { $lt: cutoffDate } },
        ...(includeDeleted ? [{ status: 'deleted' }] : []),
      ],
    };

    const documentsToDelete = await Document.find(query).select('_id url metadata size');

    for (const doc of documentsToDelete) {
      try {
        // Delete from Cloudinary if applicable
        if (doc.metadata?.cloudinaryPublicId) {
          if (!dryRun) {
            const deleteResult = await deleteFromCloudinary(doc.metadata.cloudinaryPublicId);
            if (!deleteResult.success) {
              errors.push(`Failed to delete Cloudinary file: ${doc.metadata.cloudinaryPublicId}`);
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
          await Document.deleteOne({ _id: doc._id });
        }

        deletedDocuments++;
        freedBytes += doc.size || 0;
      } catch (error: any) {
        errors.push(`Error deleting document ${doc._id}: ${error.message}`);
      }
    }

    // Clean up old attachments (this is more complex as they're embedded)
    // For now, we'll focus on documents. Attachments cleanup would require
    // updating parent documents, which is more complex.

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
  tenantId: string | Types.ObjectId,
  documentIds: string[],
  options: {
    deleteFromCloudinary?: boolean; // Delete from Cloudinary too (default: true)
  } = {}
): Promise<StorageCleanupResult> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const { deleteFromCloudinary: deleteFromCloud = true } = options;

    let deletedDocuments = 0;
    let freedBytes = 0;
    const errors: string[] = [];

    const documents = await Document.find({
      _id: { $in: documentIds.map(id => new Types.ObjectId(id)) },
      tenantId: tenantIdObj,
    }).select('_id url metadata size');

    for (const doc of documents) {
      try {
        // Delete from Cloudinary if applicable
        if (deleteFromCloud) {
          if (doc.metadata?.cloudinaryPublicId) {
            const deleteResult = await deleteFromCloudinary(doc.metadata.cloudinaryPublicId);
            if (!deleteResult.success) {
              errors.push(`Failed to delete Cloudinary file: ${doc.metadata.cloudinaryPublicId}`);
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
        await Document.deleteOne({ _id: doc._id });

        deletedDocuments++;
        freedBytes += doc.size || 0;
      } catch (error: any) {
        errors.push(`Error deleting document ${doc._id}: ${error.message}`);
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
export async function getStorageAnalytics(
  tenantId: string | Types.ObjectId
): Promise<StorageAnalytics> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get all documents
    const documents = await Document.find({
      tenantId: tenantIdObj,
    }).select('size uploadDate status').lean();

    // Get attachments from other models
    const patients = await Patient.find({ tenantId: tenantIdObj })
      .select('attachments').lean();
    const visits = await Visit.find({ tenantId: tenantIdObj })
      .select('attachments').lean();
    const labResults = await LabResult.find({ tenantId: tenantIdObj })
      .select('attachments').lean();

    // Calculate totals
    let totalFiles = 0;
    let totalBytes = 0;

    // Documents
    const documentsBytes = documents.reduce((sum, doc) => sum + (doc.size || 0), 0);
    totalFiles += documents.length;
    totalBytes += documentsBytes;

    // Patient attachments
    let patientAttachmentsBytes = 0;
    let patientAttachmentsCount = 0;
    for (const patient of patients) {
      if (patient.attachments && Array.isArray(patient.attachments)) {
        for (const attachment of patient.attachments) {
          patientAttachmentsBytes += attachment.size || 0;
          patientAttachmentsCount++;
        }
      }
    }
    totalFiles += patientAttachmentsCount;
    totalBytes += patientAttachmentsBytes;

    // Visit attachments
    let visitAttachmentsBytes = 0;
    let visitAttachmentsCount = 0;
    for (const visit of visits) {
      if (visit.attachments && Array.isArray(visit.attachments)) {
        for (const attachment of visit.attachments) {
          visitAttachmentsBytes += attachment.size || 0;
          visitAttachmentsCount++;
        }
      }
    }
    totalFiles += visitAttachmentsCount;
    totalBytes += visitAttachmentsBytes;

    // LabResult attachments
    let labResultAttachmentsBytes = 0;
    let labResultAttachmentsCount = 0;
    for (const labResult of labResults) {
      if (labResult.attachments && Array.isArray(labResult.attachments)) {
        for (const attachment of labResult.attachments) {
          labResultAttachmentsBytes += attachment.size || 0;
          labResultAttachmentsCount++;
        }
      }
    }
    totalFiles += labResultAttachmentsCount;
    totalBytes += labResultAttachmentsBytes;

    // Calculate by age
    const recent = documents.filter(d => d.uploadDate && new Date(d.uploadDate) >= thirtyDaysAgo);
    const old = documents.filter(d => {
      const uploadDate = d.uploadDate ? new Date(d.uploadDate) : null;
      return uploadDate && uploadDate >= ninetyDaysAgo && uploadDate < thirtyDaysAgo;
    });
    const veryOld = documents.filter(d => {
      const uploadDate = d.uploadDate ? new Date(d.uploadDate) : null;
      return uploadDate && uploadDate < ninetyDaysAgo;
    });

    // Calculate by status
    const active = documents.filter(d => d.status === 'active');
    const archived = documents.filter(d => d.status === 'archived');
    const deleted = documents.filter(d => d.status === 'deleted');

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

