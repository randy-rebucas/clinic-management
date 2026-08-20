import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getReferralById, updateReferral } from '@/lib/data/referral';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const referral = await run(tenantId, () => getReferralById(id));

    if (!referral) {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error fetching referral:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referral' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'referrals', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    // Update status dates
    if (body.status === 'accepted' && !body.acceptedDate) {
      body.acceptedDate = new Date();
    }
    if (body.status === 'completed' && !body.completedDate) {
      body.completedDate = new Date();
    }
    if (body.status === 'declined' && !body.declinedDate) {
      body.declinedDate = new Date();
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const referral = await run(tenantId, () => updateReferral(id, body));

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error updating referral:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update referral' },
      { status: 500 }
    );
  }
}
