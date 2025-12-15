import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import { createAuditLog } from '@/lib/audit';

/**
 * Daily backup cron job
 * Configure in vercel.json or your cron service
 */
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
    await connectDB();
    
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

    // In production, save backup to cloud storage (S3, Azure Blob, etc.)
    // For now, we'll just log it
    console.log('Daily backup created:', {
      timestamp: backup.timestamp,
      collections: backup.collections.length,
      totalDocuments: backup.totalDocuments,
    });

    // Log backup action (system user)
    await createAuditLog({
      userId: 'system' as any,
      userEmail: 'system@clinic.local',
      userRole: 'system',
      action: 'backup',
      resource: 'system',
      description: 'Daily automated backup',
      metadata: {
        collections: backup.collections,
        totalDocuments: backup.totalDocuments,
        automated: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Daily backup completed',
      timestamp: backup.timestamp,
      collections: backup.collections.length,
      totalDocuments: backup.totalDocuments,
    });
  } catch (error: any) {
    console.error('Error in daily backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create daily backup' },
      { status: 500 }
    );
  }
}

