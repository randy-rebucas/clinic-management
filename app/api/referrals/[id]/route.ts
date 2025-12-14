import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Referral from '@/models/Referral';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
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

  // Check permission to read referrals
  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
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
    
    const doctorPopulateOptions: any = {
      path: 'referringDoctor',
      select: 'firstName lastName specialization',
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const receivingDoctorPopulateOptions: any = {
      path: 'receivingDoctor',
      select: 'firstName lastName specialization',
    };
    if (tenantId) {
      receivingDoctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      receivingDoctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const referral = await Referral.findOne(query)
      .populate(doctorPopulateOptions)
      .populate(receivingDoctorPopulateOptions)
      .populate(patientPopulateOptions)
      .populate('visit', 'visitCode date')
      .populate('appointment', 'appointmentCode appointmentDate');

    if (!referral) {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error fetching referral:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referral' },
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

  // Check permission to update referrals
  const permissionCheck = await requirePermission(session, 'referrals', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    // Update status dates
    if (body.status === 'accepted' && !body.acceptedDate) {
      body.acceptedDate = new Date();
    }
    if (body.status === 'completed' && !body.completedDate) {
      body.completedDate = new Date();
    }
    if (body.status === 'declined' && !body.declinedDate) {
      body.declinedDate = new Date();
    }

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

    const referral = await Referral.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    });
    
    if (!referral) {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
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
    
    const doctorPopulateOptions: any = {
      path: 'referringDoctor',
      select: 'firstName lastName specialization',
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const receivingDoctorPopulateOptions: any = {
      path: 'receivingDoctor',
      select: 'firstName lastName specialization',
    };
    if (tenantId) {
      receivingDoctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      receivingDoctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await referral.populate(doctorPopulateOptions);
    await referral.populate(receivingDoctorPopulateOptions);
    await referral.populate(patientPopulateOptions);

    if (!referral) {
      return NextResponse.json(
        { success: false, error: 'Referral not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: referral });
  } catch (error: any) {
    console.error('Error updating referral:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update referral' },
      { status: 500 }
    );
  }
}

