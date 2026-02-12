import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Specialization from '@/models/Specialization';
import User from '@/models/User';
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

  // Check permission to read doctors
  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const doctor = await Doctor.findById(id)
      .populate('specializationId', 'name description category');
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: doctor });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch doctor' },
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

  // Check permission to update doctors
  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Handle specialization: convert specialization string to specializationId
    if (body.specialization && !body.specializationId) {
      const specializationName = body.specialization.trim();
      
      if (!specializationName) {
        return NextResponse.json(
          { success: false, error: 'Specialization is required' },
          { status: 400 }
        );
      }
      
      // Find or create specialization globally (not tenant-scoped)
      let specialization = await Specialization.findOne({ name: specializationName });
      
      if (!specialization) {
        // Create new specialization if it doesn't exist (globally)
        specialization = await Specialization.create({
          name: specializationName,
          active: true,
          category: 'Specialty', // Default category for custom specializations
        });
      }
      
      // Replace specialization string with specializationId
      body.specializationId = specialization._id;
      delete body.specialization;
    }
    
    const doctor = await Doctor.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    }).populate('specializationId', 'name description category');
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update doctor' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to delete doctors (only doctors or admins can delete)
  const permissionCheck = await requirePermission(session, 'doctors', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    
    // Find the doctor first
    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Delete associated User if exists
    const user = await User.findOne({ doctorProfile: id });
    if (user) {
      await User.findByIdAndDelete(user._id);
    }

    // Delete the doctor
    await Doctor.findByIdAndDelete(id);
    
    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting doctor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete doctor' },
      { status: 500 }
    );
  }
}

