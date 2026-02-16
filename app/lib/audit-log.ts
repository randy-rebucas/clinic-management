import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

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
}) {
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
