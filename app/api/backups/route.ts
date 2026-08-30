import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listBackupRecords, createBackupRecord } from '@/lib/data/backup-record';
import { getOrderedModelNames } from '@/lib/backup/model-order';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// GET /api/backups — list all backup records for the tenant
export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    const { items, total } = await run(tenantId, () => listBackupRecords(skip, limit));

    return NextResponse.json({
      success: true,
      data: items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error listing backups:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list backups' },
      { status: 500 }
    );
  }
}

// POST /api/backups — create a new backup and store it in the database
//
// Migrated off the raw `mongoose.connection.db` collection dump. The
// Postgres/Prisma equivalent is a per-model `findMany()` dump: we enumerate
// every Prisma model (via lib/backup/model-order.ts, itself built from
// Prisma.dmmf.datamodel.models, excluding BackupRecord) and snapshot each
// table's rows as JSON, keyed by model name (Prisma-style, e.g. "labResult")
// rather than the old Mongo collection name (e.g. "labresults").
//
// Known limitations of this approach (see prisma/MIGRATION_NOTES.md /
// lib/prisma-tenant-extension.ts for the scoping rules referenced below):
//   - Tenant scoping only applies automatically to models listed in
//     DIRECTLY_SCOPED_MODELS / JUNCTION_SCOPED_MODELS in
//     lib/prisma-tenant-extension.ts. Pure child/junction tables that hang
//     off a scoped parent (e.g. VisitDiagnosis, InvoiceLineItem,
//     DoctorScheduleSlot) have no tenantId column of their own and are NOT
//     filtered when this backup runs under a specific tenant's
//     runWithTenant() context — a tenant-scoped backup will still include
//     every tenant's rows for those tables. Likewise fully global models
//     (Tenant, Specialization) are always dumped in full. This mirrors a
//     real gap in the tenant-scoping extension itself (documented there),
//     not something this route can fix locally without per-model parent
//     joins. For an admin/system-wide backup (no tenant on the session) this
//     doesn't matter since everything is dumped anyway.
//   - This is a full logical dump (every row of every table), not an
//     incremental/point-in-time backup — large databases will produce a
//     large `BackupRecord.data` JSON blob.
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;

    const body = await request.json().catch(() => ({}));
    const label: string | undefined = body?.label?.trim() || undefined;

    const backupData: Record<string, unknown[]> = await run(tenantId, async () => {
      const modelNames = getOrderedModelNames();
      const dump: Record<string, unknown[]> = {};
      for (const modelName of modelNames) {
        const delegate = (prisma as any)[modelName[0].toLowerCase() + modelName.slice(1)];
        if (!delegate?.findMany) continue;
        dump[modelName] = await delegate.findMany({});
      }
      return dump;
    });

    const collectionNames = Object.keys(backupData);
    const totalDocuments = Object.values(backupData).reduce((s, d) => s + d.length, 0);
    const sizeBytes = Buffer.byteLength(JSON.stringify(backupData), 'utf8');

    const meta = await run(tenantId, () =>
      createBackupRecord({
        createdById: session.userId,
        createdByEmail: session.email,
        label,
        status: 'completed',
        collections: collectionNames,
        totalDocuments,
        sizeBytes,
        version: '2.0', // v2 = Postgres/Prisma model dump (v1 was raw Mongo collection dump)
        data: backupData as any,
      })
    );

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'backup',
      resource: 'system',
      resourceId: meta._id,
      description: `Database backup created${label ? `: ${label}` : ''}`,
      metadata: { collections: collectionNames, totalDocuments, sizeBytes },
    });

    return NextResponse.json(
      { success: true, data: meta, message: 'Backup created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}
