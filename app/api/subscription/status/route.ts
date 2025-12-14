import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantId } from '@/lib/tenant';
import { checkSubscriptionStatus } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get tenant ID
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
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
