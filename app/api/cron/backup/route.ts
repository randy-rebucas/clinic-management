import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runAsSystem, runWithTenant } from '@/lib/tenant-context';
import { createAuditLog } from '@/lib/audit';
import { createBackupRecord } from '@/lib/data/backup-record';
import { getOrderedModelNames } from '@/lib/backup/model-order';

/**
 * Daily backup cron job
 * Configure in vercel.json or your cron service
 *
 * Migrated off the raw `mongoose.connection.db` collection dump (see
 * app/api/backups/route.ts for the same Postgres/Prisma dump approach this
 * mirrors). Runs per active tenant since `BackupRecord.createdById` is a
 * required FK to a real User row — each tenant's backup is attributed to
 * that tenant's first admin/owner user. A tenant with no admin/owner user
 * is skipped (logged, not fatal to the rest of the run).
 */
async function dumpAllModels(): Promise<{ data: Record<string, unknown[]>; collections: string[]; totalDocuments: number }> {
  const modelNames = getOrderedModelNames();
  const data: Record<string, unknown[]> = {};
  for (const modelName of modelNames) {
    const delegate = (prisma as any)[modelName[0].toLowerCase() + modelName.slice(1)];
    if (!delegate?.findMany) continue;
    data[modelName] = await delegate.findMany({});
  }
  const collections = Object.keys(data);
  const totalDocuments = Object.values(data).reduce((sum, docs) => sum + docs.length, 0);
  return { data, collections, totalDocuments };
}

export async function GET(request: NextRequest) {
  // Authenticate request
  // Vercel Cron sends 'x-vercel-cron' header for internal authentication
  // External cron services should use 'Authorization: Bearer CRON_SECRET'
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, require authentication (unless it's Vercel Cron)
  if (cronSecret && !isVercelCron) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  // If no CRON_SECRET is set and it's not Vercel Cron, reject in production
  if (!cronSecret && !isVercelCron && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: CRON_SECRET must be set for external cron services' },
      { status: 401 }
    );
  }

  try {
    const tenants = await runAsSystem(() =>
      prisma.tenant.findMany({ where: { status: 'active' }, select: { id: true, name: true } })
    );

    const results: Array<{ tenantId: string; success: boolean; skipped?: boolean; reason?: string; totalDocuments?: number }> = [];

    for (const tenant of tenants) {
      try {
        const admin = await runAsSystem(() =>
          prisma.user.findFirst({
            where: { tenantId: tenant.id, role: { name: { in: ['admin', 'owner'] } } },
            select: { id: true, email: true },
          })
        );

        if (!admin) {
          results.push({ tenantId: tenant.id, success: false, skipped: true, reason: 'No admin/owner user found for tenant' });
          continue;
        }

        const { data, collections, totalDocuments } = await runWithTenant(tenant.id, dumpAllModels);
        const sizeBytes = Buffer.byteLength(JSON.stringify(data), 'utf8');

        await runWithTenant(tenant.id, () =>
          createBackupRecord({
            createdById: admin.id,
            createdByEmail: admin.email,
            label: `Automated daily backup — ${new Date().toISOString()}`,
            status: 'completed',
            collections,
            totalDocuments,
            sizeBytes,
            version: '2.0',
            data: data as any,
          })
        );

        await runAsSystem(() =>
          createAuditLog({
            userId: admin.id,
            userEmail: admin.email || 'system@clinic.local',
            userRole: 'system',
            tenantId: tenant.id,
            action: 'backup',
            resource: 'system',
            description: 'Daily automated backup',
            metadata: { collections, totalDocuments, automated: true },
          })
        );

        results.push({ tenantId: tenant.id, success: true, totalDocuments });
      } catch (err: any) {
        console.error(`Error backing up tenant ${tenant.id}:`, err);
        results.push({ tenantId: tenant.id, success: false, reason: err?.message || 'Unknown error' });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Daily backup processed for ${tenants.length} tenant(s)`,
      data: results,
    });
  } catch (error: any) {
    console.error('Error in daily backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create daily backup' },
      { status: 500 }
    );
  }
}
