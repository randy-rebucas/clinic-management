import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getDefaultRetentionPolicies } from '@/lib/automations/data-retention';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import LabResult from '@/models/LabResult';
import Prescription from '@/models/Prescription';
import Document from '@/models/Document';
import AuditLog from '@/models/AuditLog';
import AuditLogArchive from '@/models/AuditLogArchive';

/**
 * Get data retention status
 * GET /api/data-retention/status
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId: tenantIdObj } = ctx;

  if (!isAdmin(session)) {
    return refuseAccess(session, 'Unauthorized - Admin access required', 'data-retention');
  }

  try {
    await connectDB();

    const policies = getDefaultRetentionPolicies();
    const status: any = {};

    for (const policy of policies) {
      const now = new Date();
      const archiveDate = new Date();
      archiveDate.setDate(archiveDate.getDate() - policy.archiveAfterDays);

      let totalCount = 0;
      let archivedCount = 0;
      let toArchiveCount = 0;

      switch (policy.resource) {
        case 'appointments':
          totalCount = await Appointment.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await Appointment.countDocuments({ tenantId: tenantIdObj, archived: true });
          toArchiveCount = await Appointment.countDocuments({
            tenantId: tenantIdObj,
            createdAt: { $lt: archiveDate },
            archived: { $ne: true },
          });
          break;
        case 'visits':
          totalCount = await Visit.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await Visit.countDocuments({ tenantId: tenantIdObj, archived: true });
          toArchiveCount = await Visit.countDocuments({
            tenantId: tenantIdObj,
            createdAt: { $lt: archiveDate },
            $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
          });
          break;
        case 'invoices':
          totalCount = await Invoice.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await Invoice.countDocuments({ tenantId: tenantIdObj, archived: true });
          toArchiveCount = await Invoice.countDocuments({
            tenantId: tenantIdObj,
            createdAt: { $lt: archiveDate },
            $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
          });
          break;
        case 'lab-results':
          totalCount = await LabResult.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await LabResult.countDocuments({ tenantId: tenantIdObj, archived: true });
          toArchiveCount = await LabResult.countDocuments({
            tenantId: tenantIdObj,
            createdAt: { $lt: archiveDate },
            $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
          });
          break;
        case 'prescriptions':
          totalCount = await Prescription.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await Prescription.countDocuments({ tenantId: tenantIdObj, archived: true });
          toArchiveCount = await Prescription.countDocuments({
            tenantId: tenantIdObj,
            createdAt: { $lt: archiveDate },
            $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
          });
          break;
        case 'documents':
          totalCount = await Document.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await Document.countDocuments({ tenantId: tenantIdObj, status: 'archived' });
          toArchiveCount = await Document.countDocuments({
            tenantId: tenantIdObj,
            uploadDate: { $lt: archiveDate },
            status: { $ne: 'archived' },
          });
          break;
        case 'audit-logs': {
          // Archived entries live in files (lib/audit-archive.ts), not in the database. Whole
          // months move, so "to archive" counts up to the start of the month of archiveDate.
          const [inDatabase, files] = await Promise.all([
            AuditLog.countDocuments({ tenantId: tenantIdObj }),
            AuditLogArchive.aggregate<{ entries: number }>([
              { $match: { tenantId: tenantIdObj } },
              { $group: { _id: null, entries: { $sum: '$entries' } } },
            ]),
          ]);
          archivedCount = files[0]?.entries ?? 0;
          totalCount = inDatabase + archivedCount;
          toArchiveCount = await AuditLog.countDocuments({
            tenantId: tenantIdObj,
            timestamp: { $lt: new Date(Date.UTC(archiveDate.getUTCFullYear(), archiveDate.getUTCMonth(), 1)) },
          });
          break;
        }
      }

      status[policy.resource] = {
        policy: {
          archiveAfterDays: policy.archiveAfterDays,
          deleteAfterDays: policy.deleteAfterDays,
        },
        counts: {
          total: totalCount,
          archived: archivedCount,
          active: totalCount - archivedCount,
          toArchive: toArchiveCount,
        },
      };
    }

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('Error getting retention status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get retention status' },
      { status: 500 }
    );
  }
}

