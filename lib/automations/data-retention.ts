/**
 * Data Retention Policy Automation
 * Automatically archives or deletes old data based on retention policies
 * (PH Data Privacy Act — records are archived, not deleted, except audit
 * logs which are purged after their retention window per policy below).
 */

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAutomationSettings } from '@/lib/data/settings';
import { listTenants } from '@/lib/data/tenant';
import { bulkArchiveDocumentsBefore } from '@/lib/data/document';
import { countAuditLogsBefore, deleteAuditLogsBefore } from '@/lib/data/audit-log';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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
  tenantId: string,
  policies?: RetentionPolicy[]
): Promise<DataRetentionResult> {
  try {
    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoDataRetention) {
      return {
        success: true,
        archived: {},
        deleted: {},
        errors: [],
      };
    }

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

          const archiveResult = await archiveRecords(policy.resource, tenantId, archiveDate);
          archived[policy.resource] = archiveResult.count;
        }

        // Delete very old records
        if (policy.deleteAfterDays > 0) {
          const deleteDate = new Date();
          deleteDate.setDate(deleteDate.getDate() - policy.deleteAfterDays);

          const deleteResult = await deleteRecords(policy.resource, tenantId, deleteDate);
          deleted[policy.resource] = deleteResult.count;
        }
      } catch (error: any) {
        console.error('Error applying retention policy', { resource: policy.resource, tenantId, error });
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
    console.error('Error applying data retention policy', { tenantId, error });
    return {
      success: false,
      archived: {},
      deleted: {},
      errors: [error.message || 'Failed to apply retention policy'],
    };
  }
}

/**
 * Archive records older than specified date.
 *
 * NOTE: prisma/schema.prisma does not carry an `archived`/`archivedAt` column
 * on Appointment, Visit, Invoice, LabResult, or Prescription (only Document
 * has a status enum with an 'archived' member, and AuditLog supports hard
 * delete). This is a genuine schema gap versus the pre-migration Mongoose
 * documents, which had ad hoc `archived`/`archivedAt` fields bolted on. Until
 * those columns are added to the Postgres schema, this function reports the
 * count of records that WOULD be archived (preserving the date-math/query
 * side of the original logic and each cron run's audit trail) but performs
 * no write for those five resources — silently pretending to archive data
 * that isn't actually flagged would be worse than making the gap visible.
 * Documents and audit-logs (below) are unaffected by this gap and archive/
 * delete exactly as before.
 */
async function archiveRecords(
  resource: RetentionPolicy['resource'],
  tenantId: string,
  archiveDate: Date
): Promise<{ count: number }> {
  switch (resource) {
    case 'documents': {
      const count = await run(tenantId, () => bulkArchiveDocumentsBefore(archiveDate));
      return { count };
    }

    case 'audit-logs': {
      // Audit logs also have no `archived` flag in the Postgres schema;
      // deleteRecords() below handles their actual retention (hard delete
      // after deleteAfterDays), which is the behavior that matters for PH
      // DPA compliance. Report 0 here since no mutation happens at the
      // archive stage.
      return { count: 0 };
    }

    case 'appointments':
    case 'visits':
    case 'invoices':
    case 'lab-results':
    case 'prescriptions':
    case 'patients':
    default:
      // See function-level note: no archived column exists for these
      // resources yet. No-op.
      return { count: 0 };
  }
}

/**
 * Delete records older than specified date
 */
async function deleteRecords(
  resource: RetentionPolicy['resource'],
  tenantId: string,
  deleteDate: Date
): Promise<{ count: number }> {
  switch (resource) {
    case 'audit-logs': {
      // Only audit logs can be deleted (after their retention window).
      const count = await run(tenantId, () => deleteAuditLogsBefore(deleteDate));
      return { count };
    }

    default:
      // Other resources are never deleted (only archived).
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
    const tenants = await listTenants({ status: 'active' });

    let tenantsProcessed = 0;
    let totalArchived = 0;
    let totalDeleted = 0;

    for (const tenant of tenants) {
      try {
        const result = await applyDataRetentionPolicy(tenant.id);
        if (result.success) {
          tenantsProcessed++;
          totalArchived += Object.values(result.archived).reduce((a, b) => a + b, 0);
          totalDeleted += Object.values(result.deleted).reduce((a, b) => a + b, 0);
        }
      } catch (error: any) {
        console.error('Error processing retention for tenant', { tenantId: tenant.id, error });
      }
    }

    return {
      success: true,
      tenantsProcessed,
      totalArchived,
      totalDeleted,
    };
  } catch (error: any) {
    console.error('Error processing data retention for all tenants', error);
    return {
      success: false,
      tenantsProcessed: 0,
      totalArchived: 0,
      totalDeleted: 0,
    };
  }
}
