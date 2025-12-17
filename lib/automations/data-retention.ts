/**
 * Data Retention Policy Automation
 * Automatically archives or deletes old data based on retention policies
 */

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import LabResult from '@/models/LabResult';
import Prescription from '@/models/Prescription';
import Document from '@/models/Document';
import AuditLog from '@/models/AuditLog';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';
import { Types } from 'mongoose';

export interface RetentionPolicy {
  resource: 'patients' | 'appointments' | 'visits' | 'invoices' | 'lab-results' | 'prescriptions' | 'documents' | 'audit-logs';
  archiveAfterDays: number; // Archive after X days
  deleteAfterDays: number; // Delete after X days (0 = never delete)
  archiveToCollection?: string; // Collection name for archived data
}

export interface DataRetentionResult {
  success: boolean;
  archived: {
    [resource: string]: number;
  };
  deleted: {
    [resource: string]: number;
  };
  errors: string[];
}

/**
 * Get default retention policies
 */
export function getDefaultRetentionPolicies(): RetentionPolicy[] {
  return [
    {
      resource: 'patients',
      archiveAfterDays: 0, // Never archive (keep active)
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'appointments',
      archiveAfterDays: 365, // Archive after 1 year
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'visits',
      archiveAfterDays: 365, // Archive after 1 year
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'invoices',
      archiveAfterDays: 730, // Archive after 2 years (tax compliance)
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'lab-results',
      archiveAfterDays: 365, // Archive after 1 year
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'prescriptions',
      archiveAfterDays: 365, // Archive after 1 year
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'documents',
      archiveAfterDays: 730, // Archive after 2 years
      deleteAfterDays: 0, // Never delete
    },
    {
      resource: 'audit-logs',
      archiveAfterDays: 90, // Archive after 90 days
      deleteAfterDays: 1095, // Delete after 3 years
    },
  ];
}

/**
 * Apply data retention policy
 */
export async function applyDataRetentionPolicy(
  tenantId: string | Types.ObjectId,
  policies?: RetentionPolicy[]
): Promise<DataRetentionResult> {
  try {
    await connectDB();

    const settings = await getSettings(tenantId.toString());
    if (!settings?.automationSettings?.autoDataRetention) {
      return {
        success: true,
        archived: {},
        deleted: {},
        errors: [],
      };
    }

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const retentionPolicies = policies || getDefaultRetentionPolicies();
    const archived: { [resource: string]: number } = {};
    const deleted: { [resource: string]: number } = {};
    const errors: string[] = [];

    for (const policy of retentionPolicies) {
      try {
        // Archive old records
        if (policy.archiveAfterDays > 0) {
          const archiveDate = new Date();
          archiveDate.setDate(archiveDate.getDate() - policy.archiveAfterDays);

          const archiveResult = await archiveRecords(
            policy.resource,
            tenantIdObj,
            archiveDate
          );
          archived[policy.resource] = archiveResult.count;
        }

        // Delete very old records
        if (policy.deleteAfterDays > 0) {
          const deleteDate = new Date();
          deleteDate.setDate(deleteDate.getDate() - policy.deleteAfterDays);

          const deleteResult = await deleteRecords(
            policy.resource,
            tenantIdObj,
            deleteDate
          );
          deleted[policy.resource] = deleteResult.count;
        }
      } catch (error: any) {
        logger.error('Error applying retention policy', error as Error, {
          resource: policy.resource,
          tenantId,
        });
        errors.push(`Failed to process ${policy.resource}: ${error.message}`);
      }
    }

    return {
      success: errors.length === 0,
      archived,
      deleted,
      errors,
    };
  } catch (error: any) {
    logger.error('Error applying data retention policy', error as Error, { tenantId });
    return {
      success: false,
      archived: {},
      deleted: {},
      errors: [error.message || 'Failed to apply retention policy'],
    };
  }
}

/**
 * Archive records older than specified date
 */
async function archiveRecords(
  resource: RetentionPolicy['resource'],
  tenantId: Types.ObjectId,
  archiveDate: Date
): Promise<{ count: number }> {
  let count = 0;

  switch (resource) {
    case 'appointments':
      const appointments = await Appointment.find({
        tenantId,
        createdAt: { $lt: archiveDate },
        $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
      });
      count = appointments.length;
      if (count > 0) {
        // Add archived field if it doesn't exist in schema
        await Appointment.updateMany(
          { _id: { $in: appointments.map(a => a._id) } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
      }
      break;

    case 'visits':
      const visits = await Visit.find({
        tenantId,
        createdAt: { $lt: archiveDate },
        $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
      });
      count = visits.length;
      if (count > 0) {
        await Visit.updateMany(
          { _id: { $in: visits.map(v => v._id) } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
      }
      break;

    case 'invoices':
      const invoices = await Invoice.find({
        tenantId,
        createdAt: { $lt: archiveDate },
        $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
      });
      count = invoices.length;
      if (count > 0) {
        await Invoice.updateMany(
          { _id: { $in: invoices.map(i => i._id) } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
      }
      break;

    case 'lab-results':
      const labResults = await LabResult.find({
        tenantId,
        createdAt: { $lt: archiveDate },
        $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
      });
      count = labResults.length;
      if (count > 0) {
        await LabResult.updateMany(
          { _id: { $in: labResults.map(l => l._id) } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
      }
      break;

    case 'prescriptions':
      const prescriptions = await Prescription.find({
        tenantId,
        createdAt: { $lt: archiveDate },
        $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
      });
      count = prescriptions.length;
      if (count > 0) {
        await Prescription.updateMany(
          { _id: { $in: prescriptions.map(p => p._id) } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
      }
      break;

    case 'documents':
      const documents = await Document.find({
        tenantId,
        uploadDate: { $lt: archiveDate },
        status: { $ne: 'archived' },
      });
      count = documents.length;
      await Document.updateMany(
        { _id: { $in: documents.map(d => d._id) } },
        { $set: { status: 'archived', lastModifiedDate: new Date() } }
      );
      break;

    case 'audit-logs':
      const auditLogs = await AuditLog.find({
        tenantId,
        createdAt: { $lt: archiveDate },
        $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
      });
      count = auditLogs.length;
      if (count > 0) {
        await AuditLog.updateMany(
          { _id: { $in: auditLogs.map(a => a._id) } },
          { $set: { archived: true, archivedAt: new Date() } }
        );
      }
      break;

    default:
      // Patients are never archived
      break;
  }

  return { count };
}

/**
 * Delete records older than specified date
 */
async function deleteRecords(
  resource: RetentionPolicy['resource'],
  tenantId: Types.ObjectId,
  deleteDate: Date
): Promise<{ count: number }> {
  let count = 0;

  switch (resource) {
    case 'audit-logs':
      // Only audit logs can be deleted (after archiving)
      const auditLogsToDelete = await AuditLog.find({
        tenantId,
        archived: true,
        $or: [
          { archivedAt: { $lt: deleteDate } },
          { archivedAt: { $exists: false }, createdAt: { $lt: deleteDate } },
        ],
      });
      count = auditLogsToDelete.length;
      if (count > 0) {
        await AuditLog.deleteMany({
          _id: { $in: auditLogsToDelete.map(a => a._id) },
        });
      }
      break;

    default:
      // Other resources are never deleted (only archived)
      break;
  }

  return { count };
}

/**
 * Process data retention for all tenants
 */
export async function processDataRetentionForAllTenants(): Promise<{
  success: boolean;
  tenantsProcessed: number;
  totalArchived: number;
  totalDeleted: number;
}> {
  try {
    await connectDB();

    const Tenant = (await import('@/models/Tenant')).default;
    const tenants = await Tenant.find({ status: 'active' }).select('_id').lean();

    let tenantsProcessed = 0;
    let totalArchived = 0;
    let totalDeleted = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id?.toString() || tenant._id;
        const result = await applyDataRetentionPolicy(tenantId as string | Types.ObjectId);
        if (result.success) {
          tenantsProcessed++;
          totalArchived += Object.values(result.archived).reduce((a, b) => a + b, 0);
          totalDeleted += Object.values(result.deleted).reduce((a, b) => a + b, 0);
        }
      } catch (error: any) {
        logger.error('Error processing retention for tenant', error as Error, {
          tenantId: tenant._id,
        });
      }
    }

    return {
      success: true,
      tenantsProcessed,
      totalArchived,
      totalDeleted,
    };
  } catch (error: any) {
    logger.error('Error processing data retention for all tenants', error as Error);
    return {
      success: false,
      tenantsProcessed: 0,
      totalArchived: 0,
      totalDeleted: 0,
    };
  }
}

