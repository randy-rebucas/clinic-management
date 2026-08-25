/**
 * Storage Tracking and Enforcement
 * Tracks storage usage per tenant in a shared database architecture
 *
 * Migrated off Mongoose. Every exported function receives an explicit
 * tenantId and self-wraps its Prisma calls in runWithTenant(tenantId, fn) —
 * same self-managing convention as lib/subscription-limits.ts — since
 * callers include not-yet-migrated routes.
 */

import prisma from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant-context';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { getSubscriptionLimitations } from '@/lib/subscription-packages';

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

function tallyAttachments(
  attachments: Array<{ size: number | null; url: string | null }>,
  acc: { attachmentsBytes: number; base64Bytes: number; cloudinaryBytes: number }
) {
  for (const a of attachments) {
    if (a.size) {
      acc.attachmentsBytes += a.size;
      if (a.url && a.url.startsWith('data:')) {
        acc.base64Bytes += a.size;
      } else {
        acc.cloudinaryBytes += a.size;
      }
    }
  }
}

/**
 * Calculate storage usage for a tenant
 * Includes:
 * - Documents (from the Document model)
 * - Cloudinary files (via metadata)
 * - Attachments in other models (Patient, Visit, LabResult)
 */
export async function calculateStorageUsage(tenantId: string): Promise<StorageUsage> {
  return runWithTenant(tenantId, () => calculateStorageUsageImpl(tenantId));
}

async function calculateStorageUsageImpl(tenantId: string): Promise<StorageUsage> {
  try {
    // 1. Storage from the Document model
    const documents = await prisma.document.findMany({
      where: { status: { not: 'deleted' } },
      select: { size: true, url: true, metadata: true },
    });

    let documentsBytes = 0;
    let cloudinaryBytes = 0;
    let base64Bytes = 0;

    for (const doc of documents) {
      documentsBytes += doc.size || 0;

      const metadata = doc.metadata as { cloudinaryPublicId?: string } | null;
      if (doc.url && doc.url.startsWith('data:')) {
        base64Bytes += doc.size || 0;
      } else if (metadata?.cloudinaryPublicId) {
        cloudinaryBytes += doc.size || 0;
      } else if (doc.url && doc.url.includes('cloudinary.com')) {
        cloudinaryBytes += doc.size || 0;
      } else {
        base64Bytes += doc.size || 0;
      }
    }

    // 2. Storage from attachments in other models
    const acc = { attachmentsBytes: 0, base64Bytes: 0, cloudinaryBytes: 0 };

    const [patientAttachments, visitAttachments, labResultAttachments] = await Promise.all([
      prisma.patientAttachment.findMany({ select: { size: true, url: true } }),
      prisma.visitAttachment.findMany({ select: { size: true, url: true } }),
      prisma.labResultAttachment.findMany({ select: { size: true, url: true } }),
    ]);

    tallyAttachments(patientAttachments, acc);
    tallyAttachments(visitAttachments, acc);
    tallyAttachments(labResultAttachments, acc);

    base64Bytes += acc.base64Bytes;
    cloudinaryBytes += acc.cloudinaryBytes;
    const attachmentsBytes = acc.attachmentsBytes;

    // Total storage
    const totalBytes = documentsBytes + attachmentsBytes;
    const totalGB = totalBytes / (1024 * 1024 * 1024);

    // Get subscription limits
    const subscriptionStatus = await checkSubscriptionStatus(tenantId);
    const limitations = getSubscriptionLimitations(subscriptionStatus.plan);
    const limitGB = limitations.maxStorageGB;
    const limitBytes = limitGB !== null ? limitGB * 1024 * 1024 * 1024 : null;

    const remainingGB = limitGB !== null ? Math.max(0, limitGB - totalGB) : null;
    const remainingBytes = limitBytes !== null ? Math.max(0, limitBytes - totalBytes) : null;
    const percentageUsed = limitGB !== null ? (totalGB / limitGB) * 100 : 0;
    const exceeded = limitGB !== null && totalGB >= limitGB;

    return {
      totalBytes,
      totalGB: Math.round(totalGB * 100) / 100,
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
  tenantId: string,
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
      return { allowed: true, currentUsage, wouldExceed: false };
    }

    const newTotal = currentUsage.totalBytes + fileSizeBytes;
    const wouldExceed = newTotal > currentUsage.limitBytes;

    if (wouldExceed) {
      return {
        allowed: false,
        reason: `Uploading this file (${formatBytes(fileSizeBytes)}) would exceed your storage limit (${currentUsage.limitGB} GB). Current usage: ${currentUsage.totalGB.toFixed(2)} GB. Please delete files or upgrade your plan.`,
        currentUsage,
        wouldExceed: true,
      };
    }

    return { allowed: true, currentUsage, wouldExceed: false };
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
  tenantId: string
): Promise<{ totalBytes: number; totalResources: number }> {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME ||
        !process.env.CLOUDINARY_API_KEY ||
        !process.env.CLOUDINARY_API_SECRET) {
      return { totalBytes: 0, totalResources: 0 };
    }

    return await runWithTenant(tenantId, async () => {
      const documents = await prisma.document.findMany({
        where: {
          status: { not: 'deleted' },
          metadata: { path: ['cloudinaryPublicId'], not: undefined as any },
        },
        select: { size: true },
      });

      let totalBytes = 0;
      for (const doc of documents) {
        totalBytes += doc.size || 0;
      }

      return { totalBytes, totalResources: documents.length };
    });
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
  tenantId: string
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
