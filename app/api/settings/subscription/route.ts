import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { runAsSystem } from '@/lib/tenant-context';
import { getTenantById } from '@/lib/data/tenant';

export async function GET() {
  try {
    // Get tenant context
    const tenantContext = await getTenantContext();

    if (!tenantContext.tenant) {
      return NextResponse.json(
        { success: false, message: 'No tenant found' },
        { status: 404 }
      );
    }

    // Tenant is the scoping root — wrap in runAsSystem() per lib/data/tenant.ts's convention.
    const tenant = await runAsSystem(() => getTenantById(tenantContext.tenant!._id));

    if (!tenant) {
      return NextResponse.json(
        { success: false, message: 'Tenant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        subscription: tenant.subscriptionPlan || tenant.subscriptionStatus || tenant.subscriptionExpiresAt
          ? {
              plan: tenant.subscriptionPlan,
              status: tenant.subscriptionStatus,
              billingCycle: tenant.subscriptionBillingCycle,
              expiresAt: tenant.subscriptionExpiresAt,
              renewalAt: tenant.subscriptionRenewalAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}
