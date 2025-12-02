import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Nurse, Receptionist, Accountant, User } from '@/models';
import { verifySession } from '@/app/lib/dal';
import mongoose from 'mongoose';

// Helper to get model by staff type
function getModelByType(staffType: string) {
  switch (staffType) {
    case 'nurse': return Nurse;
    case 'receptionist': return Receptionist;
    case 'accountant': return Accountant;
    default: return null;
  }
}

// Helper to get profile field name
function getProfileField(staffType: string) {
  switch (staffType) {
    case 'nurse': return 'nurseProfile';
    case 'receptionist': return 'receptionistProfile';
    case 'accountant': return 'accountantProfile';
    default: return null;
  }
}

// GET /api/staff/[id] - Get a specific staff member
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const staffType = searchParams.get('type');

    let staff = null;
    let foundType = staffType;

    if (staffType) {
      const Model = getModelByType(staffType);
      if (Model) {
        staff = await Model.findById(id).lean();
      }
    } else {
      // Search all models
      staff = await Nurse.findById(id).lean();
      if (staff) {
        foundType = 'nurse';
      } else {
        staff = await Receptionist.findById(id).lean();
        if (staff) {
          foundType = 'receptionist';
        } else {
          staff = await Accountant.findById(id).lean();
          if (staff) {
            foundType = 'accountant';
          }
        }
      }
    }

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Get associated user
    const profileField = getProfileField(foundType!);
    const user = profileField ? await User.findOne({ [profileField]: id }).select('email name status lastLogin').lean() : null;

    return NextResponse.json({
      staff: { ...staff, staffType: foundType },
      user,
    });
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch staff' }, { status: 500 });
  }
}

// PUT /api/staff/[id] - Update a staff member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update staff' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const body = await request.json();
    const { staffType, ...updateData } = body;

    if (!staffType) {
      return NextResponse.json({ error: 'Staff type is required' }, { status: 400 });
    }

    const Model = getModelByType(staffType);
    if (!Model) {
      return NextResponse.json({ error: 'Invalid staff type' }, { status: 400 });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const staff = await Model.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Update associated user if email or name changed
    const profileField = getProfileField(staffType);
    if (profileField && (updateData.email || updateData.firstName || updateData.lastName)) {
      const userUpdate: any = {};
      if (updateData.email) userUpdate.email = updateData.email.toLowerCase().trim();
      if (updateData.firstName || updateData.lastName) {
        userUpdate.name = `${updateData.firstName || (staff as any).firstName} ${updateData.lastName || (staff as any).lastName}`.trim();
      }
      if (updateData.status) {
        userUpdate.status = updateData.status === 'active' ? 'active' : 'inactive';
      }
      
      if (Object.keys(userUpdate).length > 0) {
        await User.findOneAndUpdate({ [profileField]: id }, { $set: userUpdate });
      }
    }

    return NextResponse.json({
      message: 'Staff member updated successfully',
      staff: { ...staff, staffType },
    });
  } catch (error: any) {
    console.error('Error updating staff:', error);
    if (error.code === 11000) {
      return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update staff' }, { status: 500 });
  }
}

// DELETE /api/staff/[id] - Delete a staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete staff' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const staffType = searchParams.get('type');

    if (!staffType) {
      return NextResponse.json({ error: 'Staff type is required' }, { status: 400 });
    }

    const Model = getModelByType(staffType);
    if (!Model) {
      return NextResponse.json({ error: 'Invalid staff type' }, { status: 400 });
    }

    const staff = await Model.findByIdAndDelete(id);

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // Also delete associated user
    const profileField = getProfileField(staffType);
    if (profileField) {
      await User.findOneAndDelete({ [profileField]: id });
    }

    return NextResponse.json({
      message: 'Staff member deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting staff:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete staff' }, { status: 500 });
  }
}
