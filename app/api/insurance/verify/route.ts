import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { verifyInsurance, batchVerifyInsurance } from '@/lib/automations/insurance-verification';

/**
 * Verify insurance for a patient
 * POST /api/insurance/verify
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission
  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { patientId, patientIds } = body;

    if (patientIds && Array.isArray(patientIds)) {
      // Batch verification
      const result = await batchVerifyInsurance(patientIds, tenantId);
      return NextResponse.json({
        success: result.success,
        data: result,
      });
    } else if (patientId) {
      // Single verification
      const result = await verifyInsurance(patientId, tenantId);
      return NextResponse.json({
        success: result.verified,
        data: result,
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'patientId or patientIds required' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error verifying insurance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify insurance' },
      { status: 500 }
    );
  }
}

