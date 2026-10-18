import { NextRequest, NextResponse } from 'next/server';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { checkSubscriptionStatus } from '@/lib/subscription';

export async function GET(_request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    // Only admin/owner may view billing status
    if (!['admin', 'owner'].includes(session.role)) {
      return refuseAccess(session, 'Forbidden', 'subscription');
    }

    // Check subscription status
    const status = await checkSubscriptionStatus(tenantId);

    return NextResponse.json(status);
  } catch (error: any) {
    console.error('Error checking subscription status:', error);
    return NextResponse.json(
      { error: 'Failed to check subscription status' },
      { status: 500 }
    );
  }
}
