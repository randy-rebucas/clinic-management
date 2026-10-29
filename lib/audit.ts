// Audit logging utilities
// Logs all user actions for compliance and security

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';

export interface AuditLogOptions {
  /** Left out only for a sign-in attempt with an email that has no account. */
  userId?: string | Types.ObjectId;
  userEmail?: string;
  userRole?: string;
  tenantId?: string | Types.ObjectId; // Tenant ID for multi-tenant support
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'print' | 'download' | 'view' | 'access_denied' | 'password_change' | 'permission_change' | 'backup' | 'restore' | 'data_export' | 'data_deletion';
  resource: 'patient' | 'visit' | 'appointment' | 'prescription' | 'lab_result' | 'invoice' | 'document' | 'user' | 'doctor' | 'room' | 'service' | 'notification' | 'referral' | 'membership' | 'staff' | 'medicine' | 'settings' | 'system' | 'hmo' | 'hmo_claim' | 'philhealth' | 'clinical_template' | 'message' | 'report' | 'inventory';
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

const MINUTE_MS = 60 * 1000;

/** Permission resources (as `requirePermission` names them) → the audit log's record types. */
const PERMISSION_RESOURCE: Record<string, AuditLogOptions['resource']> = {
  patients: 'patient',
  visits: 'visit',
  appointments: 'appointment',
  prescriptions: 'prescription',
  'lab-results': 'lab_result',
  invoices: 'invoice',
  documents: 'document',
  users: 'user',
  doctors: 'doctor',
  rooms: 'room',
  services: 'service',
  notifications: 'notification',
  referrals: 'referral',
  memberships: 'membership',
  staff: 'staff',
  medicines: 'medicine',
  settings: 'settings',
  reports: 'report',
  inventory: 'inventory',
};

/** True when the same entry was written in the last `minutes`, so retries and refetches log once. */
export async function recentlyLogged(filter: Record<string, unknown>, minutes: number): Promise<boolean> {
  try {
    await connectDB();
    return !!(await AuditLog.exists({ ...filter, timestamp: { $gte: new Date(Date.now() - minutes * MINUTE_MS) } }));
  } catch {
    return false;
  }
}

/**
 * Someone was refused something their role doesn't allow (an API 403 or a page that sent them
 * back). Logged once per person and permission every 10 minutes, so a screen that retries
 * doesn't fill the log.
 */
export async function recordRefusedAccess(
  session: { userId?: string; email?: string; role?: string; tenantId?: string } | null,
  permissionResource: string,
  action: string,
  requestPath?: string
): Promise<void> {
  if (!session?.userId || !Types.ObjectId.isValid(session.userId)) return;
  const permission = `${permissionResource}:${action}`;
  const tenantId = session.tenantId && Types.ObjectId.isValid(session.tenantId) ? new Types.ObjectId(session.tenantId) : undefined;
  const seen: Record<string, unknown> = { userId: new Types.ObjectId(session.userId), action: 'access_denied', 'metadata.permission': permission };
  if (tenantId) seen.tenantId = tenantId;
  if (await recentlyLogged(seen, 10)) return;
  const verb = ACTION_VERB[action] ?? action;
  await createAuditLog({
    userId: session.userId,
    userEmail: session.email,
    userRole: session.role,
    tenantId,
    action: 'access_denied',
    resource: PERMISSION_RESOURCE[permissionResource] ?? 'system',
    requestPath,
    success: false,
    description: `Their role doesn’t allow them to ${verb} ${permissionResource.replace(/-/g, ' ')}`,
    metadata: { permission },
  });
}

const ACTION_VERB: Record<string, string> = {
  read: 'open',
  write: 'add or change',
  create: 'add',
  update: 'change',
  delete: 'remove',
};

/**
 * Someone opened one record that holds a patient's data (a visit note, prescription, lab
 * result, invoice, appointment). Logged once per person and record every 5 minutes, so the
 * page refetching after an action doesn't count as opening it again.
 */
export async function logRecordOpened(opts: {
  session: { userId: string; email?: string; role?: string };
  tenantId: string | Types.ObjectId;
  resource: AuditLogOptions['resource'];
  resourceId: string | Types.ObjectId;
  patientId?: string | Types.ObjectId | null;
  request?: { headers: Headers; nextUrl?: { pathname: string } };
}): Promise<void> {
  const { session, tenantId, resource, resourceId, patientId, request } = opts;
  if (!Types.ObjectId.isValid(String(resourceId))) return;
  if (!Types.ObjectId.isValid(session.userId)) return;
  const seen = {
    tenantId: new Types.ObjectId(String(tenantId)),
    userId: new Types.ObjectId(session.userId),
    action: 'read',
    resource,
    resourceId: new Types.ObjectId(String(resourceId)),
  };
  if (await recentlyLogged(seen, 5)) return;
  await createAuditLog({
    userId: session.userId,
    userEmail: session.email,
    userRole: session.role,
    tenantId,
    action: 'read',
    resource,
    resourceId,
    dataSubject: patientId ?? undefined,
    isSensitive: !!patientId,
    ipAddress: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request?.headers.get('user-agent') ?? undefined,
    requestMethod: 'GET',
    requestPath: request?.nextUrl?.pathname,
  });
}

/**
 * The patient portal refused a patient whose account the clinic made inactive: either a sign-in
 * (`sign-in`) or a request from a session that is still valid (`access`). There is no staff
 * account behind it, so the entry names the patient as the data subject and the role "patient".
 * Portal requests are logged once per patient every 10 minutes.
 */
export async function recordPatientRefused(
  patient: { _id: unknown; email?: string; tenantIds?: unknown[]; tenantId?: unknown } | null,
  request: { headers: Headers; nextUrl?: { pathname: string } },
  kind: 'sign-in' | 'access'
): Promise<void> {
  if (!patient?._id) return;
  try {
    const raw = patient.tenantIds?.[0] ?? patient.tenantId;
    const tenantId = raw && Types.ObjectId.isValid(String(raw)) ? new Types.ObjectId(String(raw)) : undefined;
    const patientId = new Types.ObjectId(String(patient._id));
    if (kind === 'access') {
      const seen: Record<string, unknown> = { dataSubject: patientId, action: 'access_denied', userRole: 'patient' };
      if (tenantId) seen.tenantId = tenantId;
      if (await recentlyLogged(seen, 10)) return;
    }
    await createAuditLog({
      userEmail: patient.email,
      userRole: 'patient',
      tenantId,
      action: kind === 'sign-in' ? 'login' : 'access_denied',
      resource: 'patient',
      resourceId: patientId,
      dataSubject: patientId,
      isSensitive: true,
      success: false,
      errorMessage: 'Patient account is inactive',
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      requestPath: request.nextUrl?.pathname,
      description:
        kind === 'sign-in'
          ? 'Patient portal sign-in refused: the account is inactive'
          : 'Patient portal refused: the account is inactive but its session was still in use',
    });
  } catch (error) {
    console.error('Error logging patient refusal:', error);
  }
}

/**
 * A sealed printout was issued (prescription, receipt, certificate, lab request). Each print is
 * a new numbered copy, so every one is logged, with its seal so it can be traced to the paper.
 */
export async function logPrinted(opts: {
  session: { userId: string; email?: string; role?: string };
  tenantId: string | Types.ObjectId;
  resource: AuditLogOptions['resource'];
  resourceId: string | Types.ObjectId;
  patientId?: string | Types.ObjectId | null;
  /** "the prescription (patient copy)" */
  what: string;
  seal?: { serial: string; displaySerial: string; printNumber: number; copyType?: string } | null;
  request?: { headers: Headers; nextUrl?: { pathname: string } };
}): Promise<void> {
  const { session, tenantId, resource, resourceId, patientId, what, seal, request } = opts;
  await createAuditLog({
    userId: session.userId,
    userEmail: session.email,
    userRole: session.role,
    tenantId,
    action: 'print',
    resource,
    resourceId,
    dataSubject: patientId ?? undefined,
    isSensitive: !!patientId,
    ipAddress: request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request?.headers.get('user-agent') ?? undefined,
    requestMethod: 'GET',
    requestPath: request?.nextUrl?.pathname,
    description: `Printed ${what}${seal ? `, copy ${seal.printNumber} (${seal.displaySerial})` : ''}`,
    metadata: seal ? { seal: seal.serial, printNumber: seal.printNumber, copyType: seal.copyType } : undefined,
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

