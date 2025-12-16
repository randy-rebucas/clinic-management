import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import { MedicalRepresentative, User } from '@/models';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';

// GET /api/medical-representatives/[id] - Get a single medical representative
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
    }

    const representative = await MedicalRepresentative.findById(id)
      .populate('userId', 'name email status');

    if (!representative) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: representative });
  } catch (error: any) {
    console.error('Error fetching medical representative:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to fetch medical representative' }, { status: 500 });
  }
}

// PUT /api/medical-representatives/[id] - Update a medical representative
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update medical representatives
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
    }

    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      territory,
      products,
      notes,
      status,
      availability,
    } = body;

    const representative = await MedicalRepresentative.findById(id);
    if (!representative) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    // Update fields
    if (firstName) representative.firstName = firstName;
    if (lastName) representative.lastName = lastName;
    if (email) representative.email = email.toLowerCase().trim();
    if (phone) representative.phone = phone;
    // Convert company object to string (use name field)
    if (company !== undefined) {
      representative.company = typeof company === 'object' && company !== null 
        ? (company.name || '') 
        : company;
    }
    // Convert territory array to string (join with comma)
    if (territory !== undefined) {
      representative.territory = Array.isArray(territory) 
        ? territory.join(', ') 
        : territory;
    }
    if (products) representative.products = products;
    if (notes !== undefined) representative.notes = notes;
    if (status) representative.status = status;
    if (availability) representative.availability = availability;

    await representative.save();
    await representative.populate('userId', 'name email status');

    // Also update the linked User status if needed
    if (status && representative.userId) {
      await User.findByIdAndUpdate(representative.userId, { status });
    }

    return NextResponse.json({
      success: true,
      data: representative,
      message: 'Medical representative updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating medical representative:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to update medical representative' }, { status: 500 });
  }
}

// DELETE /api/medical-representatives/[id] - Delete a medical representative
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete medical representatives
    if (!isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid ID format' }, { status: 400 });
    }

    const representative = await MedicalRepresentative.findById(id);
    if (!representative) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    // Also deactivate the linked user (soft delete)
    if (representative.userId) {
      await User.findByIdAndUpdate(representative.userId, { status: 'inactive' });
    }

    // Soft delete by setting status to inactive
    representative.status = 'inactive';
    await representative.save();

    return NextResponse.json({
      success: true,
      message: 'Medical representative deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting medical representative:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete medical representative' }, { status: 500 });
  }
}

