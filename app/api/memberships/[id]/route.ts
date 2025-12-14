import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const { id } = await params;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const referredByPopulateOptions: any = {
      path: 'referredBy',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      referredByPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      referredByPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const referralsPopulateOptions: any = {
      path: 'referrals',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      referralsPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      referralsPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const membership = await Membership.findOne(query)
      .populate(patientPopulateOptions)
      .populate(referredByPopulateOptions)
      .populate(referralsPopulateOptions);

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Membership not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error fetching membership:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch membership' },
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

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const { id } = await params;
    const body = await request.json();

    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Ensure tenantId is preserved in update
    if (tenantId && !body.tenantId) {
      body.tenantId = new Types.ObjectId(tenantId);
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const referredByPopulateOptions: any = {
      path: 'referredBy',
      select: 'firstName lastName patientCode',
    };
    if (tenantId) {
      referredByPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      referredByPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const membership = await Membership.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    })
      .populate(patientPopulateOptions)
      .populate(referredByPopulateOptions);

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Membership not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: membership });
  } catch (error: any) {
    console.error('Error updating membership:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update membership' },
      { status: 500 }
    );
  }
}

