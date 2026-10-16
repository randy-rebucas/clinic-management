import { NextResponse } from 'next/server';
import Tenant from '@/models/Tenant';
import connectDB from '@/lib/mongodb';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';

export async function GET() {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;

    await connectDB();

    const tenant = await Tenant.findById(ctx.tenantObjectId)
      .select('subscription.plan subscription.status subscription.billingCycle subscription.expiresAt subscription.renewalAt')
      .lean<any>();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found', message: 'Tenant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        subscription: tenant.subscription || null,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription', message: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}
