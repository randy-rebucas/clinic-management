import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const medicine = await Medicine.findOne(query);
    
    if (!medicine) {
      return NextResponse.json(
        { success: false, error: 'Medicine not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: medicine });
  } catch (error: any) {
    console.error('Error fetching medicine:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch medicine' },
      { status: 500 }
    );
  }
}

