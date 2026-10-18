import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { AUDIT_ROW_FIELDS, buildAuditFilter, shapeAuditRows } from '@/lib/audit-log-query';

const MAX_LIMIT = 100;

/**
 * GET /api/audit-logs — clinic administrators only. One page of the clinic's audit entries,
 * newest first, each naming the person and the patient it concerns. Filters (kind, show,
 * resource, user, patient, resourceId, from, to, search) are read by `buildAuditFilter`, which
 * the CSV export shares.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId: tenantId } = ctx;

  if (!isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Only clinic administrators can read the audit log' }, { status: 403 });
  }

  try {
    await connectDB();
    const params = request.nextUrl.searchParams;
    const tz = await getTenantTimezone(tenantId);
    const built = buildAuditFilter(params, tenantId, tz);
    if ('error' in built) return NextResponse.json({ success: false, error: built.error }, { status: 400 });

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') || '50', 10) || 50));
    const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

    const [logs, total] = await Promise.all([
      AuditLog.find(built.filter)
        .select(AUDIT_ROW_FIELDS)
        .sort({ timestamp: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(built.filter),
    ]);

    return NextResponse.json({
      success: true,
      data: await shapeAuditRows(logs as never, tenantId),
      tz,
      pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the audit log' }, { status: 500 });
  }
}
