/**
 * Data-access layer for AuditLog (+ its AuditLogChange child table, replacing
 * the embedded Mongoose `changes[]` subdocument array).
 *
 * AuditLog is a DIRECTLY_SCOPED_MODEL (lib/prisma-tenant-extension.ts) — it
 * carries an optional `tenantId` column (nullable, because some audit events
 * — e.g. platform-level actions — may legitimately have no tenant). Every
 * function below assumes the caller has already established tenant context
 * via runWithTenant(tenantId, fn) for tenant-scoped writes/reads, or
 * runAsSystem(fn) for cross-tenant / no-tenant audit events (this mirrors
 * lib/audit.ts's pre-migration behavior, where tenantId was optional on the
 * Mongoose document and omitted from the filter entirely when absent).
 *
 * IMPORTANT: lib/audit.ts (createAuditLog, logLogin, etc.) is the primary,
 * and normally only, caller of createAuditLogEntry(). Many already-migrated
 * routes across the app call those lib/audit.ts helpers — this module and
 * lib/audit.ts's internals are the seam where that traffic now lands in
 * Postgres instead of Mongo. No other file should need to change.
 */
import prisma from '../prisma';
import { runAsSystem } from '../tenant-context';
import type { Prisma, AuditAction, AuditResource } from '@prisma/client';

export interface CreateAuditLogEntryInput {
  tenantId?: string | null;
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  changes?: Array<{ field: string; oldValue?: unknown; newValue?: unknown }>;
  description?: string;
  metadata?: Record<string, unknown>;
  success?: boolean;
  errorMessage?: string;
  isSensitive?: boolean;
  dataSubjectId?: string;
  timestamp?: Date;
}

const fullInclude = {
  changes: true,
} satisfies Prisma.AuditLogInclude;

export type AuditLogWithChanges = Prisma.AuditLogGetPayload<{ include: typeof fullInclude }>;

/** Nested API-facing shape matching the pre-migration Mongoose IAuditLog contract. */
export function toAuditLogDTO(log: AuditLogWithChanges) {
  const { changes, ...rest } = log;
  return {
    _id: log.id,
    ...rest,
    changes: changes.map((c) => ({
      field: c.field,
      oldValue: c.oldValue ?? undefined,
      newValue: c.newValue ?? undefined,
    })),
  };
}

/**
 * Create an audit log entry (+ its change rows, if any). This function does
 * NOT establish tenant context itself — the caller (lib/audit.ts) decides
 * whether to wrap this in runWithTenant or runAsSystem based on whether a
 * tenantId is known for the event.
 */
export async function createAuditLogEntry(input: CreateAuditLogEntryInput) {
  const { changes, tenantId, ...rest } = input;
  return prisma.auditLog.create({
    data: {
      ...rest,
      tenantId: tenantId ?? undefined,
      timestamp: input.timestamp ?? new Date(),
      changes: changes?.length
        ? {
            create: changes.map((c) => ({
              field: c.field,
              oldValue: c.oldValue === undefined ? undefined : (c.oldValue as Prisma.InputJsonValue),
              newValue: c.newValue === undefined ? undefined : (c.newValue as Prisma.InputJsonValue),
            })),
          }
        : undefined,
    },
    include: fullInclude,
  });
}

export interface AuditLogListFilters {
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  isSensitive?: boolean;
  dataSubjectId?: string;
  from?: Date;
  to?: Date;
}

/** List audit logs for the active tenant context, most recent first. */
export async function listAuditLogs(filters: AuditLogListFilters, skip: number, take: number) {
  const where: Prisma.AuditLogWhereInput = {
    userId: filters.userId,
    action: filters.action,
    resource: filters.resource,
    resourceId: filters.resourceId,
    isSensitive: filters.isSensitive,
    dataSubjectId: filters.dataSubjectId,
  };
  if (filters.from || filters.to) {
    where.timestamp = {
      gte: filters.from,
      lte: filters.to,
    };
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: fullInclude,
      orderBy: { timestamp: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}

/** List audit logs recording access to a given patient (dataSubjectId), for PH DPA compliance views. */
export async function listPatientAccessLogs(dataSubjectId: string, skip: number, take: number) {
  const where: Prisma.AuditLogWhereInput = { dataSubjectId };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: fullInclude,
      orderBy: { timestamp: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total };
}

/**
 * Cross-tenant helper reserved for system/cron contexts that must write an
 * audit entry without an established per-request tenant context. Wraps the
 * write in runAsSystem() itself since there is no tenant to bind.
 */
export async function createSystemAuditLogEntry(input: CreateAuditLogEntryInput) {
  return runAsSystem(() => createAuditLogEntry(input));
}

// ── Automation support (lib/automations/data-retention.ts) ──────────────────

/** Count of audit logs timestamped before `before` (retention-policy dry counts). */
export function countAuditLogsBefore(before: Date) {
  return prisma.auditLog.count({ where: { timestamp: { lt: before } } });
}

/** Hard-delete audit logs timestamped before `before` — the one resource PH DPA retention policy actually deletes (not just archives). */
export async function deleteAuditLogsBefore(before: Date): Promise<number> {
  const result = await prisma.auditLog.deleteMany({ where: { timestamp: { lt: before } } });
  return result.count;
}
