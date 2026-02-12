import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Specialization from '@/models/Specialization';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';

/**
 * GET /api/specializations/[id]
 * 
 * Fetch a single specialization by ID.
 */
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

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid specialization ID' },
        { status: 400 }
      );
    }

    const specialization = await Specialization.findById(id).lean();

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: specialization });
  } catch (error: any) {
    console.error('Error fetching specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch specialization' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/specializations/[id]
 * 
 * Update a specialization.
 * Requires admin privileges.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Only admins can update specializations' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid specialization ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, description, category, active } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (category !== undefined) updateData.category = category?.trim();
    if (active !== undefined) updateData.active = active;

    // Check if name is being changed and if it conflicts with existing
    if (name) {
      const existing = await Specialization.findOne({
        name: name.trim(),
        _id: { $ne: id },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: 'A specialization with this name already exists' },
          { status: 400 }
        );
      }
    }

    const specialization = await Specialization.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: specialization });
  } catch (error: any) {
    console.error('Error updating specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update specialization' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/specializations/[id]
 * 
 * Delete a specialization.
 * Requires admin privileges.
 * Note: This will fail if doctors are using this specialization.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Only admins can delete specializations' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid specialization ID' },
        { status: 400 }
      );
    }

    // Check if any doctors are using this specialization
    const Doctor = (await import('@/models/Doctor')).default;
    const doctorCount = await Doctor.countDocuments({ specializationId: id });

    if (doctorCount > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot delete specialization. ${doctorCount} doctor(s) are currently using it.` 
        },
        { status: 400 }
      );
    }

    const specialization = await Specialization.findByIdAndDelete(id);

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Specialization deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete specialization' },
      { status: 500 }
    );
  }
}
