import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * Get list of active tenants/clinics for public selection
 * Also supports querying by subdomain to get a specific tenant
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get('subdomain');

    // If subdomain is provided, return that specific tenant
    if (subdomain) {
      const tenant = await Tenant.findOne({
        subdomain: subdomain.toLowerCase(),
        status: 'active'
      })
        .select('name displayName subdomain email phone address')
        .lean();

      if (!tenant || Array.isArray(tenant)) {
        return NextResponse.json(
          {
            success: false,
            message: 'Clinic not found',
            tenant: null,
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        tenant: {
          _id: String(tenant._id),
          name: tenant.name,
          displayName: tenant.displayName || tenant.name,
          subdomain: tenant.subdomain,
          email: tenant.email,
          phone: tenant.phone,
          address: tenant.address,
        },
      });
    }

    // Get all active tenants
    const tenants = await Tenant.find({ 
      status: 'active' 
    })
      .select('name displayName subdomain email phone address')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      tenants: tenants.map(tenant => ({
        _id: String(tenant._id),
        name: tenant.name,
        displayName: tenant.displayName || tenant.name,
        subdomain: tenant.subdomain,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching tenants:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch clinics',
        tenants: [],
      },
      { status: 500 }
    );
  }
}

