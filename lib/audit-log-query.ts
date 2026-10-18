import 'server-only';
import { Types } from 'mongoose';
import User from '@/models/User';
import Patient from '@/models/Patient';
import { parseDateParam } from '@/app/api/reports/_lib/report-range';
import { KIND_ACTIONS, isAuditKind, isAuditResource, isAuditShow, type AuditRow, type AuditShow } from '@/lib/audit-log';

/**
 * The audit log's filters, read from a query string the same way by the list and the CSV
 * export, so a download always holds exactly the entries the page was showing.
 */

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function showClause(show: AuditShow): Record<string, unknown> {
  switch (show) {
    case 'patient':
      return { dataSubject: { $ne: null } };
    case 'refused':
      return { action: 'access_denied' };
    case 'failed-sign-in':
      return { action: 'login', success: false };
    case 'failed':
      return { success: false };
  }
}

export function buildAuditFilter(
  params: URLSearchParams,
  tenantId: Types.ObjectId,
  tz: string
): { filter: Record<string, unknown> } | { error: string } {
  const and: Record<string, unknown>[] = [];

  const kind = params.get('kind');
  if (kind) {
    if (!isAuditKind(kind)) return { error: 'Unknown kind of entry' };
    and.push({ action: { $in: KIND_ACTIONS[kind] } });
  }
  const show = params.get('show');
  if (show) {
    if (!isAuditShow(show)) return { error: 'Unknown filter' };
    and.push(showClause(show));
  }
  const resource = params.get('resource');
  if (resource) {
    if (!isAuditResource(resource)) return { error: 'Unknown record type' };
    and.push({ resource });
  }
  for (const [param, field] of [
    ['user', 'userId'],
    ['patient', 'dataSubject'],
    ['resourceId', 'resourceId'],
  ] as const) {
    const value = params.get(param);
    if (!value) continue;
    if (!Types.ObjectId.isValid(value)) return { error: 'Invalid id filter' };
    and.push({ [field]: new Types.ObjectId(value) });
  }

  const from = params.get('from');
  const to = params.get('to');
  if (from || to) {
    const start = parseDateParam(from, tz, 'start');
    const end = parseDateParam(to, tz, 'end');
    if ((from && !start) || (to && !end)) return { error: 'Those dates aren’t valid' };
    if (start && end && start > end) return { error: 'The “from” date is after the “to” date' };
    const range: Record<string, Date> = {};
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    and.push({ timestamp: range });
  }

  const search = params.get('search')?.trim().slice(0, 100);
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    and.push({ $or: [{ description: re }, { userEmail: re }, { errorMessage: re }, { requestPath: re }] });
  }

  return { filter: and.length ? { tenantId, $and: and } : { tenantId } };
}

export const AUDIT_ROW_FIELDS =
  'timestamp action resource resourceId success description errorMessage isSensitive userId userEmail userRole dataSubject ipAddress userAgent requestMethod requestPath changes metadata';

type LeanLog = {
  _id: Types.ObjectId;
  timestamp: Date;
  action: AuditRow['action'];
  resource: AuditRow['resource'];
  resourceId?: Types.ObjectId;
  success?: boolean;
  description?: string;
  errorMessage?: string;
  isSensitive?: boolean;
  userId?: Types.ObjectId;
  userEmail?: string;
  userRole?: string;
  dataSubject?: Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  changes?: AuditRow['changes'];
  metadata?: Record<string, unknown>;
};

export function roleWords(role: string | null | undefined): string | null {
  if (!role) return null;
  const words = role.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Names the person and the patient on each entry (looked up, so a removed one is said so). */
export async function shapeAuditRows(logs: LeanLog[], tenantId: Types.ObjectId): Promise<AuditRow[]> {
  const userIds = [...new Set(logs.map((l) => l.userId?.toString()).filter(Boolean))] as string[];
  const patientIds = [...new Set(logs.map((l) => l.dataSubject?.toString()).filter(Boolean))] as string[];
  const [users, patients] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds }, tenantId }).select('name email').lean<{ _id: Types.ObjectId; name?: string; email?: string }[]>()
      : Promise.resolve([]),
    patientIds.length
      ? Patient.find({ _id: { $in: patientIds }, tenantIds: tenantId })
          .select('firstName lastName patientCode')
          .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string; patientCode?: string }[]>()
      : Promise.resolve([]),
  ]);
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const patientById = new Map(patients.map((p) => [p._id.toString(), p]));

  return logs.map((l) => {
    const uid = l.userId?.toString() ?? null;
    const u = uid ? userById.get(uid) : undefined;
    const pid = l.dataSubject?.toString() ?? null;
    const p = pid ? patientById.get(pid) : undefined;
    return {
      _id: l._id.toString(),
      at: new Date(l.timestamp).toISOString(),
      action: l.action,
      resource: l.resource,
      resourceId: l.resourceId?.toString() ?? null,
      success: l.success !== false,
      description: l.description?.trim() || null,
      errorMessage: l.errorMessage?.trim() || null,
      isSensitive: !!l.isSensitive,
      user: { _id: uid, name: u?.name?.trim() || null, email: u?.email || l.userEmail || null, role: roleWords(l.userRole) },
      patient: p
        ? { _id: p._id.toString(), name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Unnamed patient', code: p.patientCode ?? null }
        : null,
      patientMissing: !!pid && !p,
      ipAddress: l.ipAddress && l.ipAddress !== 'unknown' ? l.ipAddress.split(',')[0].trim() : null,
      userAgent: l.userAgent && l.userAgent !== 'unknown' ? l.userAgent : null,
      requestMethod: l.requestMethod || null,
      requestPath: l.requestPath || null,
      changes: Array.isArray(l.changes) ? l.changes : [],
      metadata: l.metadata && typeof l.metadata === 'object' && Object.keys(l.metadata).length ? l.metadata : null,
    };
  });
}
