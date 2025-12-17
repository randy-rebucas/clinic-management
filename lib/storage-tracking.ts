/**
 * Storage Tracking and Enforcement
 * Tracks storage usage per tenant in a shared database architecture
 */

import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations, checkLimit } from '@/lib/subscription-packages';
import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

export interface StorageUsage {
  totalBytes: number;
  totalGB: number;
  documentsBytes: number;
  cloudinaryBytes: number;
  attachmentsBytes: number;
  base64Bytes: number;
  limitGB: number | null;
  limitBytes: number | null;
  remainingGB: number | null;
  remainingBytes: number | null;
  percentageUsed: number;
  exceeded: boolean;
}

/**
 * Calculate storage usage for a tenant
 * Includes:
 * - Documents (from Document model)
 * - Cloudinary files (via API or metadata)
 * - Attachments in other models (Patient, Visit, LabResult)
 */
export async function calculateStorageUsage(
  tenantId: string | Types.ObjectId
): Promise<StorageUsage> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    // 1. Calculate storage from Document model
    const documents = await Document.find({
      tenantId: tenantIdObj,
      status: { $ne: 'deleted' }, // Exclude deleted documents
    }).select('size url metadata').lean();

    let documentsBytes = 0;
    let cloudinaryBytes = 0;
    let base64Bytes = 0;

    for (const doc of documents) {
      documentsBytes += doc.size || 0;

      // Check if stored in Cloudinary or base64
      if (doc.url && doc.url.startsWith('data:')) {
        // Base64 stored in MongoDB
        base64Bytes += doc.size || 0;
      } else if (doc.metadata?.cloudinaryPublicId) {
        // Stored in Cloudinary - size is already in doc.size
        cloudinaryBytes += doc.size || 0;
      } else if (doc.url && doc.url.includes('cloudinary.com')) {
        // Cloudinary URL but no public ID in metadata - estimate from size
        cloudinaryBytes += doc.size || 0;
      } else {
        // Assume base64 or other storage
        base64Bytes += doc.size || 0;
      }
    }

    // 2. Calculate storage from attachments in other models
    let attachmentsBytes = 0;

    // Patient attachments
    const patients = await Patient.find({
      tenantId: tenantIdObj,
    }).select('attachments').lean();

    for (const patient of patients) {
      if (patient.attachments && Array.isArray(patient.attachments)) {
        for (const attachment of patient.attachments) {
          if (attachment.size) {
            attachmentsBytes += attachment.size;
            // Check if base64
            if (attachment.url && attachment.url.startsWith('data:')) {
              base64Bytes += attachment.size;
            } else {
              cloudinaryBytes += attachment.size;
            }
          }
        }
      }
    }

    // Visit attachments
    const visits = await Visit.find({
      tenantId: tenantIdObj,
    }).select('attachments').lean();

    for (const visit of visits) {
      if (visit.attachments && Array.isArray(visit.attachments)) {
        for (const attachment of visit.attachments) {
          if (attachment.size) {
            attachmentsBytes += attachment.size;
            // Check if base64
            if (attachment.url && attachment.url.startsWith('data:')) {
              base64Bytes += attachment.size;
            } else {
              cloudinaryBytes += attachment.size;
            }
          }
        }
      }
    }

    // LabResult attachments
    const labResults = await LabResult.find({
      tenantId: tenantIdObj,
    }).select('attachments').lean();

    for (const labResult of labResults) {
      if (labResult.attachments && Array.isArray(labResult.attachments)) {
        for (const attachment of labResult.attachments) {
          if (attachment.size) {
            attachmentsBytes += attachment.size;
            // Check if base64
            if (attachment.url && attachment.url.startsWith('data:')) {
              base64Bytes += attachment.size;
            } else {
              cloudinaryBytes += attachment.size;
            }
          }
        }
      }
    }

    // Total storage
    const totalBytes = documentsBytes + attachmentsBytes;
    const totalGB = totalBytes / (1024 * 1024 * 1024); // Convert bytes to GB

    // Get subscription limits
    const subscriptionStatus = await checkSubscriptionStatus(tenantIdObj);
    const limitations = getSubscriptionLimitations(subscriptionStatus.plan);
    const limitGB = limitations.maxStorageGB;
    const limitBytes = limitGB !== null ? limitGB * 1024 * 1024 * 1024 : null;

    const remainingGB = limitGB !== null ? Math.max(0, limitGB - totalGB) : null;
    const remainingBytes = limitBytes !== null ? Math.max(0, limitBytes - totalBytes) : null;
    const percentageUsed = limitGB !== null ? (totalGB / limitGB) * 100 : 0;
    const exceeded = limitGB !== null && totalGB >= limitGB;

    return {
      totalBytes,
      totalGB: Math.round(totalGB * 100) / 100, // Round to 2 decimal places
      documentsBytes,
      cloudinaryBytes,
      attachmentsBytes,
      base64Bytes,
      limitGB,
      limitBytes,
      remainingGB: remainingGB !== null ? Math.round(remainingGB * 100) / 100 : null,
      remainingBytes,
      percentageUsed: Math.round(percentageUsed * 100) / 100,
      exceeded,
    };
  } catch (error: any) {
    console.error('Error calculating storage usage:', error);
    throw error;
  }
}

/**
 * Check if tenant can upload a file of given size
 */
export async function checkStorageLimit(
  tenantId: string | Types.ObjectId,
  fileSizeBytes: number
): Promise<{
  allowed: boolean;
  reason?: string;
  currentUsage?: StorageUsage;
  wouldExceed?: boolean;
}> {
  try {
    const currentUsage = await calculateStorageUsage(tenantId);

    if (currentUsage.exceeded) {
      return {
        allowed: false,
        reason: `Storage limit (${currentUsage.limitGB} GB) already exceeded. Please delete files or upgrade your plan.`,
        currentUsage,
        wouldExceed: true,
      };
    }

    if (currentUsage.limitBytes === null) {
      // Unlimited storage
      return {
        allowed: true,
        currentUsage,
        wouldExceed: false,
      };
    }

    const newTotal = currentUsage.totalBytes + fileSizeBytes;
    const wouldExceed = newTotal > currentUsage.limitBytes!;

    if (wouldExceed) {
      const newTotalGB = newTotal / (1024 * 1024 * 1024);
      return {
        allowed: false,
        reason: `Uploading this file (${formatBytes(fileSizeBytes)}) would exceed your storage limit (${currentUsage.limitGB} GB). Current usage: ${currentUsage.totalGB.toFixed(2)} GB. Please delete files or upgrade your plan.`,
        currentUsage,
        wouldExceed: true,
      };
    }

    return {
      allowed: true,
      currentUsage,
      wouldExceed: false,
    };
  } catch (error: any) {
    console.error('Error checking storage limit:', error);
    // On error, allow upload (fail open) but log the error
    return {
      allowed: true,
      reason: 'Unable to verify storage limit. Upload allowed.',
    };
  }
}

/**
 * Get Cloudinary storage usage for a tenant
 * Note: This requires Cloudinary API access and may be slow
 * Use this for periodic audits, not real-time checks
 */
export async function getCloudinaryStorageUsage(
  tenantId: string | Types.ObjectId
): Promise<{ totalBytes: number; totalResources: number }> {
  try {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || 
        !process.env.CLOUDINARY_API_KEY || 
        !process.env.CLOUDINARY_API_SECRET) {
      return { totalBytes: 0, totalResources: 0 };
    }

    // Get all documents with Cloudinary public IDs
    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const documents = await Document.find({
      tenantId: tenantIdObj,
      status: { $ne: 'deleted' },
      'metadata.cloudinaryPublicId': { $exists: true },
    }).select('metadata size').lean();

    // Sum up sizes from documents (already stored)
    let totalBytes = 0;
    for (const doc of documents) {
      totalBytes += doc.size || 0;
    }

    // Note: To get exact Cloudinary usage, you would need to:
    // 1. Use Cloudinary Admin API to list resources by folder/tag
    // 2. Sum up bytes from each resource
    // This is expensive and should be done via cron job, not real-time

    return {
      totalBytes,
      totalResources: documents.length,
    };
  } catch (error: any) {
    console.error('Error getting Cloudinary storage usage:', error);
    return { totalBytes: 0, totalResources: 0 };
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format GB to human-readable string
 */
export function formatGB(gb: number, decimals: number = 2): string {
  return formatBytes(gb * 1024 * 1024 * 1024, decimals);
}

/**
 * Get storage usage summary for API response
 */
export async function getStorageUsageSummary(
  tenantId: string | Types.ObjectId
): Promise<{
  usage: StorageUsage;
  formatted: {
    total: string;
    limit: string;
    remaining: string;
    percentageUsed: string;
  };
}> {
  const usage = await calculateStorageUsage(tenantId);

  return {
    usage,
    formatted: {
      total: formatGB(usage.totalGB),
      limit: usage.limitGB !== null ? formatGB(usage.limitGB) : 'Unlimited',
      remaining: usage.remainingGB !== null ? formatGB(usage.remainingGB) : 'Unlimited',
      percentageUsed: `${usage.percentageUsed}%`,
    },
  };
}

