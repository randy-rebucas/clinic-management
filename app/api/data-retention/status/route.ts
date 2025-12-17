import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { getDefaultRetentionPolicies } from '@/lib/automations/data-retention';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import LabResult from '@/models/LabResult';
import Prescription from '@/models/Prescription';
import Document from '@/models/Document';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

/**
 * Get data retention status
 * GET /api/data-retention/status
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
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

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

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
        case 'audit-logs':
          totalCount = await AuditLog.countDocuments({ tenantId: tenantIdObj });
          archivedCount = await AuditLog.countDocuments({ tenantId: tenantIdObj, archived: true });
          toArchiveCount = await AuditLog.countDocuments({
            tenantId: tenantIdObj,
            createdAt: { $lt: archiveDate },
            $or: [{ archived: { $exists: false } }, { archived: { $ne: true } }],
          });
          break;
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

