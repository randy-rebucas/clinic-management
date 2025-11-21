import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can trigger backups
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    
    // Get all collections
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const collections = await db.listCollections().toArray();
    const backupData: { [key: string]: any[] } = {};
    const timestamp = new Date().toISOString();

    // Export each collection
    for (const collection of collections) {
      const collectionName = collection.name;
      // Skip system collections
      if (collectionName.startsWith('system.')) {
        continue;
      }

      const Model = mongoose.models[collectionName] || mongoose.model(collectionName, new mongoose.Schema({}, { strict: false }));
      const documents = await Model.find({}).lean();
      backupData[collectionName] = documents;
    }

    // Create backup metadata
    const backup = {
      timestamp,
      version: '1.0',
      collections: Object.keys(backupData),
      totalDocuments: Object.values(backupData).reduce((sum, docs) => sum + docs.length, 0),
      data: backupData,
    };

    // Log backup action
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'backup',
      resource: 'system',
      description: 'Database backup created',
      metadata: {
        collections: backup.collections,
        totalDocuments: backup.totalDocuments,
      },
    });

    // Return backup as JSON (in production, save to file or cloud storage)
    return NextResponse.json({
      success: true,
      data: backup,
      message: 'Backup created successfully',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="backup-${timestamp}.json"`,
      },
    });
  } catch (error: any) {
    console.error('Error creating backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can restore backups
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json();
    const { backupData } = body;

    if (!backupData || !backupData.data) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup data' },
        { status: 400 }
      );
    }

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const results: { [key: string]: { inserted: number; errors: number } } = {};

    // Restore each collection
    for (const [collectionName, documents] of Object.entries(backupData.data)) {
      try {
        // Clear existing collection (WARNING: This deletes all data)
        await db.collection(collectionName).deleteMany({});
        
        // Insert backup data
        if (Array.isArray(documents) && documents.length > 0) {
          await db.collection(collectionName).insertMany(documents);
          results[collectionName] = { inserted: documents.length, errors: 0 };
        }
      } catch (error: any) {
        console.error(`Error restoring collection ${collectionName}:`, error);
        results[collectionName] = { inserted: 0, errors: 1 };
      }
    }

    // Log restore action
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'restore',
      resource: 'system',
      description: 'Database backup restored',
      metadata: {
        backupTimestamp: backupData.timestamp,
        results,
      },
    });

    return NextResponse.json({
      success: true,
      data: results,
      message: 'Backup restored successfully',
    });
  } catch (error: any) {
    console.error('Error restoring backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to restore backup' },
      { status: 500 }
    );
  }
}

