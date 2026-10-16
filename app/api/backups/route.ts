import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import mongoose from 'mongoose';
import BackupRecord from '@/models/BackupRecord';

const { EJSON } = mongoose.mongo.BSON;

// GET /api/backups — list all backup records for the tenant
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const skip = (page - 1) * limit;

    const filter = { tenantId: tenantObjectId };

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

// Stay well under MongoDB's 16MB document limit (the snapshot is stored in one BackupRecord).
const MAX_BACKUP_BYTES = 12 * 1024 * 1024;

// Never copied into a backup: credentials, OTPs and device tokens.
const SECRET_FIELDS = [
  'password',
  'defaultPassword',
  'totpSecret',
  'totpLastUsedStep',
  'otp',
  'otpExpiry',
  'otpAttempts',
  'loginQrTokenHash',
  'loginQrTokenExpiry',
  'pushToken',
  'feedbackToken',
  'resetPasswordToken',
  'resetPasswordExpires',
];
const SECRET_PROJECTION = Object.fromEntries(SECRET_FIELDS.map((f) => [f, 0]));

// Platform-level or credential-only collections that are not part of a clinic's data export.
const SKIPPED_COLLECTIONS = new Set([
  'backuprecords',
  'mobiledevices',
  'pushsubscriptions',
  'paypalorders',
  'counters',
  'specializations',
]);

class BackupTooLargeError extends Error {}

// POST /api/backups — snapshot THIS clinic's data (never other tenants', never credentials)
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const body = await request.json().catch(() => ({}));
    const label: string | undefined =
      typeof body?.label === 'string' ? body.label.trim().slice(0, 200) || undefined : undefined;

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not available');

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const backupData: Record<string, unknown[]> = {};
    let sizeBytes = 0;

    for (const col of collections) {
      if (col.name.startsWith('system.') || SKIPPED_COLLECTIONS.has(col.name)) continue;

      const filter =
        col.name === 'tenants'
          ? { _id: tenantObjectId }
          : { $or: [{ tenantId: tenantObjectId }, { tenantIds: tenantObjectId }] };

      const docs: unknown[] = [];
      for await (const doc of db.collection(col.name).find(filter, { projection: SECRET_PROJECTION })) {
        sizeBytes += Buffer.byteLength(EJSON.stringify(doc), 'utf8');
        if (sizeBytes > MAX_BACKUP_BYTES) throw new BackupTooLargeError();
        docs.push(doc);
      }
      if (docs.length) backupData[col.name] = docs;
    }

    const collectionNames = Object.keys(backupData);
    const totalDocuments = Object.values(backupData).reduce((s, d) => s + d.length, 0);

    const record = await BackupRecord.create({
      tenantId: tenantObjectId,
      createdBy: session.userId,
      createdByEmail: session.email,
      label,
      status: 'completed',
      collections: collectionNames,
      totalDocuments,
      sizeBytes,
      version: '2.0',
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
      description: `Clinic data backup created${label ? `: ${label}` : ''}`,
      metadata: { collections: collectionNames, totalDocuments, sizeBytes },
    });

    // Return metadata only (not the raw data blob)
    const { data: _omit, ...meta } = record.toObject();
    return NextResponse.json(
      { success: true, data: meta, message: 'Backup created successfully' },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof BackupTooLargeError) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your clinic data is too large for an in-app backup (limit ~12MB). Use MongoDB Atlas snapshots or mongodump (scripts/backup/backup.sh) instead.',
        },
        { status: 413 }
      );
    }
    console.error('Error creating backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}
