import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import mongoose, { Types } from 'mongoose';
import BackupRecord from '@/models/BackupRecord';
import User from '@/models/User';
import { MAX_BACKUP_BYTES, SECRET_FIELDS, SKIPPED_COLLECTIONS, sizeLabel, type BackupRow, type BackupSummary } from '@/lib/backups';

const { EJSON } = mongoose.mongo.BSON;

type LeanBackup = {
  _id: Types.ObjectId;
  label?: string;
  status: BackupRow['status'];
  createdAt: Date;
  createdBy?: Types.ObjectId;
  createdByEmail?: string;
  collections?: string[];
  counts?: Record<string, number>;
  totalDocuments?: number;
  sizeBytes?: number;
  errorMessage?: string;
};

/**
 * GET /api/backups — clinic administrators only. The clinic's backups, newest first, without
 * their contents, each naming who made it; plus how many are kept, how much they take up, and
 * the newest one's size (what the next backup will be measured against).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Only clinic administrators can see backups', 'backups');

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
    const filter = { tenantId: tenantObjectId };

    const [backups, total, stored, last] = await Promise.all([
      BackupRecord.find(filter, { data: 0 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<LeanBackup[]>(),
      BackupRecord.countDocuments(filter),
      BackupRecord.aggregate<{ bytes: number }>([{ $match: filter }, { $group: { _id: null, bytes: { $sum: '$sizeBytes' } } }]),
      BackupRecord.findOne({ ...filter, status: 'completed' }, { createdAt: 1, sizeBytes: 1 })
        .sort({ createdAt: -1 })
        .lean<{ createdAt: Date; sizeBytes?: number } | null>(),
    ]);

    const userIds = [...new Set(backups.map((b) => b.createdBy?.toString()).filter(Boolean))] as string[];
    const names = new Map(
      (await User.find({ _id: { $in: userIds }, tenantId: tenantObjectId }).select('name email').lean<{ _id: Types.ObjectId; name?: string; email?: string }[]>()).map(
        (u) => [u._id.toString(), u]
      )
    );

    const data: BackupRow[] = backups.map((b) => {
      const uid = b.createdBy?.toString() ?? null;
      const u = uid ? names.get(uid) : undefined;
      return {
        _id: b._id.toString(),
        label: b.label?.trim() || null,
        status: b.status,
        createdAt: new Date(b.createdAt).toISOString(),
        createdBy: { _id: uid, name: u?.name?.trim() || null, email: u?.email || b.createdByEmail || null },
        collections: b.collections ?? [],
        counts: b.counts && typeof b.counts === 'object' ? b.counts : null,
        totalDocuments: b.totalDocuments ?? 0,
        sizeBytes: b.sizeBytes ?? 0,
        errorMessage: b.errorMessage?.trim() || null,
      };
    });
    const summary: BackupSummary = {
      total,
      storedBytes: stored[0]?.bytes ?? 0,
      last: last ? { at: new Date(last.createdAt).toISOString(), sizeBytes: last.sizeBytes ?? 0 } : null,
    };

    return NextResponse.json({
      success: true,
      data,
      summary,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Error listing backups:', error);
    return NextResponse.json({ success: false, error: 'Failed to list backups' }, { status: 500 });
  }
}

const SECRET_PROJECTION = Object.fromEntries(SECRET_FIELDS.map((f) => [f, 0]));
const SKIPPED = new Set(SKIPPED_COLLECTIONS);

class BackupTooLargeError extends Error {}

/** POST /api/backups — snapshot THIS clinic's data (never other clinics', never credentials). */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Only clinic administrators can make backups', 'backups', 'write');

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
      if (col.name.startsWith('system.') || SKIPPED.has(col.name)) continue;

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
    const counts = Object.fromEntries(collectionNames.map((name) => [name, backupData[name].length]));
    const totalDocuments = Object.values(counts).reduce((s, n) => s + n, 0);

    const record = await BackupRecord.create({
      tenantId: tenantObjectId,
      createdBy: session.userId,
      createdByEmail: session.email,
      label,
      status: 'completed',
      collections: collectionNames,
      counts,
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
      resourceId: record._id as Types.ObjectId,
      description: `Made a backup${label ? ` (${label})` : ''}: ${totalDocuments.toLocaleString('en-US')} records, ${sizeLabel(sizeBytes)}`,
      metadata: { collections: collectionNames, totalDocuments, sizeBytes },
    });

    return NextResponse.json({ success: true, data: { _id: String(record._id), totalDocuments, sizeBytes } }, { status: 201 });
  } catch (error) {
    if (error instanceof BackupTooLargeError) {
      return NextResponse.json(
        {
          success: false,
          error: `The clinic’s records are larger than an in-app backup can hold (${sizeLabel(MAX_BACKUP_BYTES)}). Use database-level backups instead: MongoDB Atlas snapshots or scripts/backup/backup.sh.`,
        },
        { status: 413 }
      );
    }
    console.error('Error creating backup:', error);
    return NextResponse.json({ success: false, error: 'Failed to create backup' }, { status: 500 });
  }
}
