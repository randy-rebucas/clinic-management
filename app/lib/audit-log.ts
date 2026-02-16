
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

interface LogAuditArgs {
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: any;
  description?: string;
  success: boolean;
  requestMethod?: string;
  requestPath?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export async function logAudit({
  userId,
  userEmail,
  userRole,
  action,
  resource,
  resourceId,
  changes,
  description,
  success,
  requestMethod,
  requestPath,
  ipAddress,
  userAgent,
  metadata,
}: LogAuditArgs) {
  try {
    await AuditLog.create({
      userId: Types.ObjectId(userId),
      userEmail,
      userRole,
      action,
      resource,
      resourceId: resourceId ? Types.ObjectId(resourceId) : undefined,
      changes,
      description,
      success,
      requestMethod,
      requestPath,
      ipAddress,
      userAgent,
      metadata,
      timestamp: new Date(),
    });
  } catch (err) {
    // Optionally log error elsewhere
    console.error('Audit log error:', err);
  }
}
