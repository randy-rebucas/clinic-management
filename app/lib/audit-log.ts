// Migrated off Mongoose: now calls lib/data/audit-log.ts (Prisma) instead
// of models/AuditLog.ts directly. This was a second, independent audit-log
// writer distinct from lib/audit.ts — same class of gap, found during the
// full-codebase audit after the automations-layer migration.

import { createAuditLogEntry, createSystemAuditLogEntry } from '@/lib/data/audit-log';
import { runWithTenant } from '@/lib/tenant-context';

interface LogAuditArgs {
  userId: string;
  userEmail?: string;
  userRole?: string;
  tenantId?: string;
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
  tenantId,
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
    const input = {
      userId,
      userEmail,
      userRole,
      action: action as any,
      resource: resource as any,
      resourceId,
      changes,
      description,
      success,
      requestMethod,
      requestPath,
      ipAddress,
      userAgent,
      metadata,
      timestamp: new Date(),
    };

    if (tenantId) {
      await runWithTenant(tenantId, () => createAuditLogEntry({ ...input, tenantId }));
    } else {
      await createSystemAuditLogEntry(input);
    }
  } catch (err) {
    // Optionally log error elsewhere
    console.error('Audit log error:', err);
  }
}
