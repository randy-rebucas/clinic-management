import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { createAuditLog } from '@/lib/audit';
import { deviceLabel } from '@/lib/user-agent';
import { AUDIT_ROW_FIELDS, buildAuditFilter, shapeAuditRows } from '@/lib/audit-log-query';
import { AUDIT_EXPORT_MAX, RESOURCE_LABEL, actionPhrase, usefulDescription } from '@/lib/audit-log';

/**
 * GET /api/audit-logs/export — clinic administrators only. The entries the audit log page is
 * showing (same filters), newest first, as CSV with times in the clinic's zone, up to
 * AUDIT_EXPORT_MAX rows. The download is itself recorded in the audit log.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId: tenantId } = ctx;
  if (!isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Only clinic administrators can download the audit log' }, { status: 403 });
  }

  try {
    await connectDB();
    const params = request.nextUrl.searchParams;
    const tz = await getTenantTimezone(tenantId);
    const built = buildAuditFilter(params, tenantId, tz);
    if ('error' in built) return NextResponse.json({ success: false, error: built.error }, { status: 400 });

    const logs = await AuditLog.find(built.filter)
      .select(AUDIT_ROW_FIELDS)
      .sort({ timestamp: -1, _id: -1 })
      .limit(AUDIT_EXPORT_MAX)
      .lean();
    const rows = await shapeAuditRows(logs as never, tenantId);

    const head = ['When', 'Who', 'Email', 'Role', 'What', 'Record type', 'Record id', 'Patient', 'Patient code', 'Result', 'Details', 'Problem', 'IP address', 'Device', 'Request'];
    const lines = rows.map((r) => [
      formatInTz(new Date(r.at), 'yyyy-MM-dd HH:mm:ss', tz),
      r.user.name ?? (r.user.email ? '' : 'Someone no longer on file'),
      r.user.email ?? '',
      r.user.role ?? '',
      actionPhrase(r.action, r.resource, r.success),
      RESOURCE_LABEL[r.resource] ?? r.resource,
      r.resourceId ?? '',
      r.patient?.name ?? (r.patientMissing ? 'No longer on file' : ''),
      r.patient?.code ?? '',
      r.success ? 'Done' : 'Didn’t go through',
      usefulDescription(r.description) ?? '',
      r.errorMessage ?? '',
      r.ipAddress ?? '',
      r.userAgent ? deviceLabel(r.userAgent) : '',
      [r.requestMethod, r.requestPath].filter(Boolean).join(' '),
    ]);
    const csv = [head, ...lines].map((cells) => cells.map(csvCell).join(',')).join('\r\n');

    const patient = params.get('patient');
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId,
      action: 'data_export',
      resource: 'system',
      dataSubject: patient || undefined,
      isSensitive: !!patient,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      requestMethod: 'GET',
      requestPath: request.nextUrl.pathname,
      description: `Downloaded ${rows.length.toLocaleString('en-US')} audit log ${rows.length === 1 ? 'entry' : 'entries'}`,
      metadata: { filters: Object.fromEntries(params.entries()), rows: rows.length },
    });

    const stamp = formatInTz(new Date(), 'yyyy-MM-dd', tz);
    return new NextResponse('﻿' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return NextResponse.json({ success: false, error: 'Failed to download the audit log' }, { status: 500 });
  }
}

function csvCell(raw: string): string {
  // Neutralise spreadsheet formulas (CSV injection).
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
