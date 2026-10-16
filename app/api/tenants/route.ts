import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

/**
 * GET /api/tenants — minimal list of active clinics for subdomain/clinic selection UI.
 *
 * Tenant creation goes through POST /api/tenants/onboard (self-service) only; the former
 * admin-only POST here let any clinic admin create other tenants and has been removed.
 */
export async function GET() {
  try {
    await connectDB();
    // Only expose minimal fields needed for subdomain/clinic selection UI
    const tenants = await Tenant.find({ status: 'active' })
      .select('name displayName subdomain')
      .lean();
    return NextResponse.json({ success: true, data: tenants });
  } catch (error) {
    console.error('Error listing tenants:', error);
    return NextResponse.json({ success: false, error: 'Failed to load clinics' }, { status: 500 });
  }
}
