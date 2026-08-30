import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getDefaultRetentionPolicies } from '@/lib/automations/data-retention';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Get data retention status
 * GET /api/data-retention/status
 *
 * NOTE: prisma/schema.prisma does not carry an `archived`/`archivedAt`
 * column on Appointment, Visit, Invoice, LabResult, Prescription, or
 * AuditLog (only Document has a `status` enum with an 'archived' member).
 * This mirrors the same gap already documented and handled in
 * lib/automations/data-retention.ts (archiveRecords()) — those five
 * resources report `archived: 0` and `toArchive` counts records that WOULD
 * be archived by date alone (since none are ever actually flagged archived
 * yet), rather than pretending a flag exists that isn't in the schema.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const policies = getDefaultRetentionPolicies();
    const status: any = {};

    for (const policy of policies) {
      const archiveDate = new Date();
      archiveDate.setDate(archiveDate.getDate() - policy.archiveAfterDays);

      let totalCount = 0;
      let archivedCount = 0;
      let toArchiveCount = 0;

      switch (policy.resource) {
        case 'appointments':
          totalCount = await run(tenantId, () => prisma.appointment.count({ where: {} }));
          // archived flag doesn't exist in Postgres schema yet — see note above.
          archivedCount = 0;
          toArchiveCount = await run(tenantId, () =>
            prisma.appointment.count({ where: { createdAt: { lt: archiveDate } } })
          );
          break;
        case 'visits':
          totalCount = await run(tenantId, () => prisma.visit.count({ where: {} }));
          archivedCount = 0;
          toArchiveCount = await run(tenantId, () =>
            prisma.visit.count({ where: { createdAt: { lt: archiveDate } } })
          );
          break;
        case 'invoices':
          totalCount = await run(tenantId, () => prisma.invoice.count({ where: {} }));
          archivedCount = 0;
          toArchiveCount = await run(tenantId, () =>
            prisma.invoice.count({ where: { createdAt: { lt: archiveDate } } })
          );
          break;
        case 'lab-results':
          totalCount = await run(tenantId, () => prisma.labResult.count({ where: {} }));
          archivedCount = 0;
          toArchiveCount = await run(tenantId, () =>
            prisma.labResult.count({ where: { createdAt: { lt: archiveDate } } })
          );
          break;
        case 'prescriptions':
          totalCount = await run(tenantId, () => prisma.prescription.count({ where: {} }));
          archivedCount = 0;
          toArchiveCount = await run(tenantId, () =>
            prisma.prescription.count({ where: { createdAt: { lt: archiveDate } } })
          );
          break;
        case 'documents':
          totalCount = await run(tenantId, () => prisma.document.count({ where: {} }));
          archivedCount = await run(tenantId, () =>
            prisma.document.count({ where: { status: 'archived' } })
          );
          toArchiveCount = await run(tenantId, () =>
            prisma.document.count({
              where: { uploadDate: { lt: archiveDate }, status: { not: 'archived' } },
            })
          );
          break;
        case 'audit-logs':
          totalCount = await run(tenantId, () => prisma.auditLog.count({ where: {} }));
          // AuditLog has no archived flag either; only hard-delete (via
          // deleteAfterDays) applies to it — see archiveRecords() note.
          archivedCount = 0;
          toArchiveCount = await run(tenantId, () =>
            prisma.auditLog.count({ where: { createdAt: { lt: archiveDate } } })
          );
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
