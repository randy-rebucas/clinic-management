// Audit logging utilities
// Logs all user actions for compliance and security

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

export interface AuditLogOptions {
  userId: string | Types.ObjectId;
  userEmail?: string;
  userRole?: string;
  tenantId?: string | Types.ObjectId; // Tenant ID for multi-tenant support
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'print' | 'download' | 'view' | 'access_denied' | 'password_change' | 'permission_change' | 'backup' | 'restore' | 'data_export' | 'data_deletion';
  resource: 'patient' | 'visit' | 'appointment' | 'prescription' | 'lab_result' | 'invoice' | 'document' | 'user' | 'doctor' | 'room' | 'service' | 'notification' | 'system';
  resourceId?: string | Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  changes?: Array<{ field: string; oldValue?: any; newValue?: any }>;
  description?: string;
  metadata?: { [key: string]: any };
  success?: boolean;
  errorMessage?: string;
  isSensitive?: boolean;
  dataSubject?: string | Types.ObjectId; // Patient ID for PH DPA compliance
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(options: AuditLogOptions): Promise<void> {
  try {
    await connectDB();
    
    // Get tenantId from options or try to get from context
    let tenantId = options.tenantId;
    if (!tenantId) {
      try {
        const { getTenantContext } = await import('./tenant');
        const tenantContext = await getTenantContext();
        tenantId = tenantContext.tenantId || undefined;
      } catch (error) {
        // If tenant context can't be retrieved, continue without tenantId
        console.warn('Could not get tenant context for audit log');
      }
    }
    
    const auditLogData: any = {
      userId: options.userId,
      userEmail: options.userEmail,
      userRole: options.userRole,
      action: options.action,
      resource: options.resource,
      resourceId: options.resourceId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      requestMethod: options.requestMethod,
      requestPath: options.requestPath,
      changes: options.changes,
      description: options.description,
      metadata: options.metadata,
      success: options.success !== undefined ? options.success : true,
      errorMessage: options.errorMessage,
      isSensitive: options.isSensitive || false,
      dataSubject: options.dataSubject,
      timestamp: new Date(),
    };
    
    if (tenantId) {
      auditLogData.tenantId = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;
    }
    
    await AuditLog.create(auditLogData);
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error('Error creating audit log:', error);
  }
}

/**
 * Log user login
 */
export async function logLogin(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  ipAddress?: string,
  userAgent?: string,
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'login',
    resource: 'system',
    ipAddress,
    userAgent,
    description: `User logged in: ${userEmail}`,
  });
}

/**
 * Log user logout
 */
export async function logLogout(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  ipAddress?: string,
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'logout',
    resource: 'system',
    ipAddress,
    description: `User logged out: ${userEmail}`,
  });
}

/**
 * Log data access (for PH DPA compliance)
 */
export async function logDataAccess(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId: string | Types.ObjectId,
  dataSubject: string | Types.ObjectId, // Patient ID
  ipAddress?: string,
  userAgent?: string,
  requestPath?: string,
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'read',
    resource,
    resourceId,
    dataSubject,
    ipAddress,
    userAgent,
    requestPath,
    isSensitive: true,
    description: `Accessed ${resource} data for patient ${dataSubject}`,
  });
}

/**
 * Log data modification
 */
export async function logDataModification(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId: string | Types.ObjectId,
  changes: Array<{ field: string; oldValue?: any; newValue?: any }>,
  dataSubject?: string | Types.ObjectId,
  ipAddress?: string,
  requestPath?: string,
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'update',
    resource,
    resourceId,
    changes,
    dataSubject,
    ipAddress,
    requestPath,
    isSensitive: !!dataSubject,
    description: `Modified ${resource} ${resourceId}`,
  });
}

/**
 * Log data deletion
 */
export async function logDataDeletion(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId: string | Types.ObjectId,
  dataSubject?: string | Types.ObjectId,
  ipAddress?: string,
  requestPath?: string,
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'delete',
    resource,
    resourceId,
    dataSubject,
    ipAddress,
    requestPath,
    isSensitive: !!dataSubject,
    description: `Deleted ${resource} ${resourceId}`,
  });
}

/**
 * Log access denied
 */
export async function logAccessDenied(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId?: string | Types.ObjectId,
  ipAddress?: string,
  requestPath?: string,
  reason?: string,
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'access_denied',
    resource,
    resourceId,
    ipAddress,
    requestPath,
    success: false,
    description: `Access denied to ${resource}${resourceId ? ` ${resourceId}` : ''}${reason ? `: ${reason}` : ''}`,
  });
}

/**
 * Log data export (for PH DPA compliance)
 */
export async function logDataExport(
  userId: string | Types.ObjectId,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  dataSubject?: string | Types.ObjectId,
  ipAddress?: string,
  metadata?: { [key: string]: any },
  tenantId?: string | Types.ObjectId
): Promise<void> {
  await createAuditLog({
    userId,
    userEmail,
    userRole,
    tenantId,
    action: 'data_export',
    resource,
    dataSubject,
    ipAddress,
    isSensitive: !!dataSubject,
    metadata,
    description: `Exported ${resource} data${dataSubject ? ` for patient ${dataSubject}` : ''}`,
  });
}

