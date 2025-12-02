import { NextRequest, NextResponse } from 'next/server';
import { getTenantBySlug } from '@/app/lib/tenant';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { success: false, error: 'Tenant slug is required' },
        { status: 400 }
      );
    }

    await connectDB();
    const tenant = await Tenant.findOne({ slug, status: 'active' }).lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tenant: {
        _id: tenant._id.toString(),
        slug: tenant.slug,
        name: tenant.name,
        displayName: tenant.displayName,
        logo: tenant.logo,
      },
    });
  } catch (error) {
    console.error('Error fetching tenant info:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tenant info' },
      { status: 500 }
    );
  }
}

