/**
 * Storage maintenance: retrying file removals that failed, bulk delete, and analytics.
 *
 * Nothing here erases a document record. Deleting a document always goes through
 * softDeleteDocument (lib/document-file.ts): the record stays for the audit trail and medical
 * record retention, and only its file goes.
 */

import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import { Types } from 'mongoose';
import { PENDING_FILE_REMOVAL, removeDocumentFile, softDeleteDocument } from '@/lib/document-file';
import { ownAttachments } from '@/lib/patient-attachments';

export interface StorageCleanupResult {
  success: boolean;
  /** Documents moved to deleted (bulk delete only). */
  deletedDocuments: number;
  /** Stored files removed from Cloudinary. */
  filesRemoved: number;
  /** Files that could not be removed yet; they stay marked and the next cleanup tries again. */
  filesPending: number;
  /** Bytes of active documents moved to deleted (bulk delete only). */
  freedBytes: number;
  freedGB: number;
  /** Deleted documents, for the audit log. */
  deleted: { _id: string; documentCode?: string; patient?: string; size: number }[];
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

const toGB = (bytes: number) => Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
const asObjectId = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id);

/**
 * Remove the Cloudinary files of deleted documents whose removal failed when they were deleted
 * (or that were deleted before removals were recorded). Records are left in place.
 */
export async function retryPendingFileRemovals(
  tenantId: string | Types.ObjectId,
  options: { dryRun?: boolean; limit?: number } = {}
): Promise<StorageCleanupResult> {
  const { dryRun = false, limit = 500 } = options;
  const result: StorageCleanupResult = {
    success: true, deletedDocuments: 0, filesRemoved: 0, filesPending: 0, freedBytes: 0, freedGB: 0, deleted: [], errors: [],
  };
  try {
    await connectDB();
    const pending = await Document.find({ tenantId: asObjectId(tenantId), ...PENDING_FILE_REMOVAL })
      .select('_id url metadata')
      .limit(limit)
      .lean<{ _id: Types.ObjectId; url?: string; metadata?: any }[]>();

    for (const doc of pending) {
      if (dryRun) {
        result.filesPending++;
        continue;
      }
      const { gone, fields } = await removeDocumentFile(doc);
      if (gone) {
        await Document.updateOne({ _id: doc._id }, { $set: fields });
        result.filesRemoved++;
      } else {
        result.filesPending++;
        result.errors.push(`File of document ${doc._id} could not be removed`);
      }
    }
    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    console.error('Error retrying file removals:', error);
    return { ...result, success: false, errors: ['Storage cleanup failed'] };
  }
}

/** Delete documents by id: each record is kept as deleted and its file removed, as on the document page. */
export async function bulkDeleteFiles(
  tenantId: string | Types.ObjectId,
  documentIds: string[],
  userId: string
): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = {
    success: true, deletedDocuments: 0, filesRemoved: 0, filesPending: 0, freedBytes: 0, freedGB: 0, deleted: [], errors: [],
  };
  try {
    await connectDB();
    const tenantIdObj = asObjectId(tenantId);
    const documents = await Document.find({
      _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
      tenantId: tenantIdObj,
      status: { $ne: 'deleted' },
    })
      .select('_id url metadata size documentCode patient')
      .lean<{ _id: Types.ObjectId; url?: string; metadata?: any; size?: number; documentCode?: string; patient?: Types.ObjectId }[]>();

    for (const doc of documents) {
      try {
        const hadFile = Boolean(doc.metadata?.cloudinaryPublicId) || /res\.cloudinary\.com/.test(doc.url ?? '');
        const { deleted, fileGone } = await softDeleteDocument({ _id: doc._id, tenantId: tenantIdObj }, doc, userId);
        if (!deleted) continue;
        result.deletedDocuments++;
        result.freedBytes += doc.size || 0;
        if (hadFile && fileGone) result.filesRemoved++;
        if (!fileGone) {
          result.filesPending++;
          result.errors.push(`File of document ${doc._id} could not be removed`);
        }
        result.deleted.push({ _id: String(doc._id), documentCode: doc.documentCode, patient: doc.patient ? String(doc.patient) : undefined, size: doc.size || 0 });
      } catch (error) {
        console.error(`Error deleting document ${doc._id}:`, error);
        result.errors.push(`Error deleting document ${doc._id}`);
      }
    }
    result.freedGB = toGB(result.freedBytes);
    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    console.error('Error bulk deleting files:', error);
    return { ...result, success: false, errors: ['Storage cleanup failed'] };
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
    const patients = await Patient.find({ tenantIds: tenantIdObj })
      .select('attachments.size attachments.tenantId').lean();
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
        for (const attachment of ownAttachments(patient.attachments, tenantIdObj)) {
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

