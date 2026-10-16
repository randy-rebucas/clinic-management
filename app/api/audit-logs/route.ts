import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { isAdmin } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
} from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { parseDateParam } from '@/app/api/reports/_lib/report-range';

const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Only admin can view audit logs
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const resource = searchParams.get('resource');
    const resourceId = searchParams.get('resourceId');
    const action = searchParams.get('action');
    const dataSubject = searchParams.get('dataSubject'); // Patient ID for PH DPA
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isSensitive = searchParams.get('isSensitive');
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    for (const value of [userId, resourceId, dataSubject]) {
      if (value && !isValidId(value)) {
        return NextResponse.json({ success: false, error: 'Invalid id filter' }, { status: 400 });
      }
    }

    const query: any = tenantFilter(tenantId);

    if (userId) {
      query.userId = userId;
    }

    if (resource) {
      query.resource = resource;
    }

    if (resourceId) {
      query.resourceId = resourceId;
    }

    if (action) {
      query.action = action;
    }

    if (dataSubject) {
      query.dataSubject = dataSubject;
    }

    if (isSensitive !== null) {
      query.isSensitive = isSensitive === 'true';
    }

    if (startDate || endDate) {
      const tz = await getTenantTimezone(tenantId);
      const start = parseDateParam(startDate, tz, 'start');
      const end = parseDateParam(endDate, tz, 'end');
      if ((startDate && !start) || (endDate && !end)) {
        return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
      }
      query.timestamp = {};
      if (start) query.timestamp.$gte = start;
      if (end) query.timestamp.$lte = end;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email role')
        .populate({
          path: 'dataSubject',
          select: 'firstName lastName patientCode',
          match: patientTenantFilter(tenantId),
        })
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
