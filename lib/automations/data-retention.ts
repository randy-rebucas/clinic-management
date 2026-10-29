/**
 * Data Retention Policy Automation
 * Flags old clinical and billing records as archived (they stay in the database). Audit logs are
 * moved out of the database into archive files, and only those files are ever deleted
 * (lib/audit-archive.ts).
 */

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import LabResult from '@/models/LabResult';
import Prescription from '@/models/Prescription';
import Document from '@/models/Document';
import {
  AUDIT_ARCHIVE_DEFAULTS,
  archiveAuditLogs,
  deleteExpiredArchives,
  isArchiveStorageConfigured,
} from '@/lib/audit-archive';
import { getSettings } from '@/lib/settings';
import logger from '@/lib/logger';
import { Types, Model } from 'mongoose';

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

/** Records touched per batch, and batches per resource per run (the job is weekly). */
const BATCH_SIZE = 1000;
const MAX_BATCHES = 20;
/** Floor that caller-supplied policies cannot go below (audit logs have their own, in lib/audit-archive.ts). */
const MIN_ARCHIVE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

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
      archiveAfterDays: AUDIT_ARCHIVE_DEFAULTS.keepInDatabaseDays, // Moved to an archive file (whole months)
      deleteAfterDays: AUDIT_ARCHIVE_DEFAULTS.keepArchiveDays, // Archive files deleted after this
    },
  ];
}

/**
 * Apply data retention policy for one tenant
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

    const tenantIdObj = new Types.ObjectId(String(tenantId));

    const retentionPolicies = policies || getDefaultRetentionPolicies();
    const archived: { [resource: string]: number } = {};
    const deleted: { [resource: string]: number } = {};
    const errors: string[] = [];

    for (const policy of retentionPolicies) {
      try {
        if (policy.resource === 'audit-logs') {
          // Entries leave the database only into a verified archive file; without a Blob store
          // they simply stay.
          if (isArchiveStorageConfigured()) {
            if (policy.archiveAfterDays > 0) {
              archived[policy.resource] = (await archiveAuditLogs(tenantIdObj, policy.archiveAfterDays)).entries;
            }
            if (policy.deleteAfterDays > 0) {
              deleted['audit-log-archive-files'] = await deleteExpiredArchives(tenantIdObj, policy.deleteAfterDays);
            }
          }
          continue;
        }

        if (policy.archiveAfterDays > 0) {
          const days = Math.max(MIN_ARCHIVE_DAYS, policy.archiveAfterDays);
          const archiveDate = new Date(Date.now() - days * DAY_MS);
          const archiveResult = await archiveRecords(policy.resource, tenantIdObj, archiveDate);
          archived[policy.resource] = archiveResult.count;
        }

      } catch (error: any) {
        logger.error('Error applying retention policy', error as Error, {
          resource: policy.resource,
          tenantId: String(tenantId),
        });
        errors.push(`Failed to process ${policy.resource}`);
      }
    }

    return {
      success: errors.length === 0,
      archived,
      deleted,
      errors,
    };
  } catch (error: any) {
    logger.error('Error applying data retention policy', error as Error, { tenantId: String(tenantId) });
    return {
      success: false,
      archived: {},
      deleted: {},
      errors: ['Failed to apply retention policy'],
    };
  }
}

/** Flag matching records in bounded batches (ids first, so each batch is capped). */
async function archiveInBatches(
  model: Model<any>,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<number> {
  let count = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const ids = (await model.find(filter).select('_id').limit(BATCH_SIZE).lean()).map((d: any) => d._id);
    if (ids.length === 0) break;
    const res = await model.updateMany({ _id: { $in: ids } }, { $set: update });
    count += res.modifiedCount ?? ids.length;
    if (ids.length < BATCH_SIZE) break;
  }
  return count;
}

const notArchived = { archived: { $ne: true } };

/**
 * Archive records older than specified date
 */
async function archiveRecords(
  resource: RetentionPolicy['resource'],
  tenantId: Types.ObjectId,
  archiveDate: Date
): Promise<{ count: number }> {
  const flag = { archived: true, archivedAt: new Date() };
  const older = { tenantId, createdAt: { $lt: archiveDate }, ...notArchived };

  switch (resource) {
    case 'appointments':
      return { count: await archiveInBatches(Appointment, older, flag) };
    case 'visits':
      return { count: await archiveInBatches(Visit, older, flag) };
    case 'invoices':
      // Unsettled invoices stay active regardless of age.
      return { count: await archiveInBatches(Invoice, { ...older, status: { $in: ['paid', 'refunded'] } }, flag) };
    case 'lab-results':
      return { count: await archiveInBatches(LabResult, older, flag) };
    case 'prescriptions':
      return { count: await archiveInBatches(Prescription, older, flag) };
    case 'documents':
      return {
        count: await archiveInBatches(
          Document,
          { tenantId, uploadDate: { $lt: archiveDate }, status: 'active' },
          { status: 'archived', lastModifiedDate: new Date() }
        ),
      };
    default:
      // Patients are never archived
      return { count: 0 };
  }
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

    for (const tenant of tenants as any[]) {
      try {
        const result = await applyDataRetentionPolicy(String(tenant._id));
        if (result.success) {
          tenantsProcessed++;
          totalArchived += Object.values(result.archived).reduce((a, b) => a + b, 0);
          totalDeleted += Object.values(result.deleted).reduce((a, b) => a + b, 0);
        }
      } catch (error: any) {
        logger.error('Error processing retention for tenant', error as Error, {
          tenantId: String(tenant._id),
        });
      }
    }

    // Entries that belong to no clinic (platform sign-ins, unknown emails) follow the default policy.
    if (isArchiveStorageConfigured()) {
      try {
        totalArchived += (await archiveAuditLogs(null)).entries;
        totalDeleted += await deleteExpiredArchives(null);
      } catch (error: any) {
        logger.error('Error archiving platform audit log entries', error as Error);
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
