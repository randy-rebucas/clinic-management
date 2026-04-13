import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import Tenant from '@/models/Tenant';
import connectDB from '@/lib/mongodb';

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

    // Connect to database
    await connectDB();

    // Fetch tenant with subscription data
    const tenant = await Tenant.findById(tenantContext.tenant._id).select('subscription');

    if (!tenant) {
      return NextResponse.json(
        { success: false, message: 'Tenant not found' },
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
      { success: false, message: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}
