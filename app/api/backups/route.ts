import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listBackupRecords, createBackupRecord } from '@/lib/data/backup-record';
// NOTE: the raw collection dump below (mongoose.connection.db) is genuine
// pre-cutover MongoDB backup infrastructure — it snapshots the live Mongo
// database, which still exists during the migration window. It intentionally
// stays on the Mongo driver; only the BackupRecord bookkeeping row moves to
// Prisma/Postgres (lib/data/backup-record.ts).
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';

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

    // Genuine pre-cutover Mongo backup: dump every live Mongo collection.
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not available');

    const collections = await db.listCollections().toArray();
    const backupData: Record<string, unknown[]> = {};

    for (const col of collections) {
      if (col.name.startsWith('system.') || col.name === 'backuprecords') continue;

      const colRef = db.collection(col.name);
      const docs = await colRef.find({}).toArray();
      backupData[col.name] = docs;
    }

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
        version: '1.0',
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
