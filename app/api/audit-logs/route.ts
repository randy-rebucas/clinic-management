import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listAuditLogs } from '@/lib/data/audit-log';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can view audit logs
  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const resource = searchParams.get('resource');
    const resourceId = searchParams.get('resourceId');
    const action = searchParams.get('action');
    const dataSubject = searchParams.get('dataSubject'); // Patient ID for PH DPA
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const isSensitive = searchParams.get('isSensitive');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);

    let end: Date | undefined;
    if (endDate) {
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    const skip = (page - 1) * limit;

    const { items, total } = tenantId
      ? await runWithTenant(tenantId, () =>
          listAuditLogs(
            {
              userId: userId || undefined,
              resource: (resource as any) || undefined,
              resourceId: resourceId || undefined,
              action: (action as any) || undefined,
              dataSubjectId: dataSubject || undefined,
              isSensitive: isSensitive !== null ? isSensitive === 'true' : undefined,
              from: startDate ? new Date(startDate) : undefined,
              to: end,
            },
            skip,
            limit
          )
        )
      : await runAsSystem(() =>
          listAuditLogs(
            {
              userId: userId || undefined,
              resource: (resource as any) || undefined,
              resourceId: resourceId || undefined,
              action: (action as any) || undefined,
              dataSubjectId: dataSubject || undefined,
              isSensitive: isSensitive !== null ? isSensitive === 'true' : undefined,
              from: startDate ? new Date(startDate) : undefined,
              to: end,
            },
            skip,
            limit
          )
        );

    return NextResponse.json({
      success: true,
      data: items,
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
