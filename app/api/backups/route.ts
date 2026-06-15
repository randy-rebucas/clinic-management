import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import mongoose from 'mongoose';
import BackupRecord from '@/models/BackupRecord';

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
    await connectDB();
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const skip = (page - 1) * limit;

    const filter = tenantId ? { tenantId } : {};

    const [backups, total] = await Promise.all([
      BackupRecord.find(filter, { data: 0 }) // exclude raw data from list
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BackupRecord.countDocuments(filter),
    ]);

    return NextResponse.json({
      success: true,
      data: backups,
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
    await connectDB();
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;

    const body = await request.json().catch(() => ({}));
    const label: string | undefined = body?.label?.trim() || undefined;

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

    const record = await BackupRecord.create({
      tenantId,
      createdBy: session.userId,
      createdByEmail: session.email,
      label,
      status: 'completed',
      collections: collectionNames,
      totalDocuments,
      sizeBytes,
      version: '1.0',
      data: backupData,
    });

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'backup',
      resource: 'system',
      resourceId: record._id as any,
      description: `Database backup created${label ? `: ${label}` : ''}`,
      metadata: { collections: collectionNames, totalDocuments, sizeBytes },
    });

    // Return metadata only (not the raw data blob)
    const { data: _omit, ...meta } = record.toObject();
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
