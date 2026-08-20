import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listAuditLogs } from '@/lib/data/audit-log';

/**
 * Get audit logs for a specific patient (PH DPA compliance - right to access)
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Users can only view access logs for patients they have permission to access
    // In production, add additional permission checks here

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { items } = tenantId
      ? await runWithTenant(tenantId, () =>
          listAuditLogs({ dataSubjectId: patientId, isSensitive: true }, 0, 100)
        )
      : await runAsSystem(() =>
          listAuditLogs({ dataSubjectId: patientId, isSensitive: true }, 0, 100)
        );

    return NextResponse.json({
      success: true,
      data: items,
      message: 'Patient data access history (PH DPA compliance)',
    });
  } catch (error: any) {
    console.error('Error fetching patient access logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient access logs' },
      { status: 500 }
    );
  }
}
