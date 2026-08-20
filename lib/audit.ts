// Audit logging utilities
// Logs all user actions for compliance and security
//
// Migrated off Mongoose (Phase 5 Batch 6): internals now call
// lib/data/audit-log.ts (Prisma) instead of models/AuditLog.ts. Every
// exported function signature below is UNCHANGED from the pre-migration
// version — callers throughout the app (createAuditLog, logLogin, etc.)
// require no changes and automatically start writing to Postgres.

import { createAuditLogEntry, createSystemAuditLogEntry } from '@/lib/data/audit-log';
import { runWithTenant } from '@/lib/tenant-context';

export interface AuditLogOptions {
  userId: string;
  userEmail?: string;
  userRole?: string;
  tenantId?: string; // Tenant ID for multi-tenant support
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'print' | 'download' | 'view' | 'access_denied' | 'password_change' | 'permission_change' | 'backup' | 'restore' | 'data_export' | 'data_deletion';
  resource: 'patient' | 'visit' | 'appointment' | 'prescription' | 'lab_result' | 'invoice' | 'document' | 'user' | 'doctor' | 'room' | 'service' | 'notification' | 'system';
  resourceId?: string;
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
  dataSubject?: string; // Patient ID for PH DPA compliance
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(options: AuditLogOptions): Promise<void> {
  try {
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

    const entryInput = {
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
      dataSubjectId: options.dataSubject,
      timestamp: new Date(),
    };

    // AuditLog carries a nullable tenantId column and is a directly-scoped
    // model in lib/prisma-tenant-extension.ts, so every write needs an
    // active tenant context (runWithTenant when we resolved one, otherwise
    // createSystemAuditLogEntry's own runAsSystem for genuinely tenant-less
    // system/cron actions).
    if (tenantId) {
      await runWithTenant(tenantId, () => createAuditLogEntry({ ...entryInput, tenantId }));
    } else {
      await createSystemAuditLogEntry(entryInput);
    }
  } catch (error) {
    // Don't throw - audit logging should not break the application
    console.error('Error creating audit log:', error);
  }
}

/**
 * Log user login
 */
export async function logLogin(
  userId: string,
  userEmail: string,
  userRole: string,
  ipAddress?: string,
  userAgent?: string,
  tenantId?: string
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
  userId: string,
  userEmail: string,
  userRole: string,
  ipAddress?: string,
  tenantId?: string
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
  userId: string,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId: string,
  dataSubject: string, // Patient ID
  ipAddress?: string,
  userAgent?: string,
  requestPath?: string,
  tenantId?: string
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
  userId: string,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId: string,
  changes: Array<{ field: string; oldValue?: any; newValue?: any }>,
  dataSubject?: string,
  ipAddress?: string,
  requestPath?: string,
  tenantId?: string
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
  userId: string,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId: string,
  dataSubject?: string,
  ipAddress?: string,
  requestPath?: string,
  tenantId?: string
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
  userId: string,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  resourceId?: string,
  ipAddress?: string,
  requestPath?: string,
  reason?: string,
  tenantId?: string
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
  userId: string,
  userEmail: string,
  userRole: string,
  resource: AuditLogOptions['resource'],
  dataSubject?: string,
  ipAddress?: string,
  metadata?: { [key: string]: any },
  tenantId?: string
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
