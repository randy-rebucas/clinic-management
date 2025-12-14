import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
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
    
    // Ensure models are registered before populate
    if (!mongoose.models.Medicine) {
      const _ = Medicine;
    }
    if (!mongoose.models.User) {
      const _ = User;
    }
    
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
    const medicinePopulateOptions: any = {
      path: 'medicineId',
      select: 'name genericName',
    };
    if (tenantId) {
      medicinePopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      medicinePopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const item = await InventoryItem.findOne(query)
      .populate(medicinePopulateOptions)
      .populate('lastRestockedBy', 'name')
      .lean()
      .exec();

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error fetching inventory item:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    const errorMessage = error?.message || 'Failed to fetch inventory item';
    return NextResponse.json(
      { success: false, error: errorMessage },
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

  // Only admin can update inventory
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    
    // Ensure models are registered before populate
    if (!mongoose.models.Medicine) {
      const _ = Medicine;
    }
    if (!mongoose.models.User) {
      const _ = User;
    }
    
    const { id } = await params;
    const body = await request.json();

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

    // If quantity is being updated, track restock
    if (body.quantity !== undefined) {
      const currentItem = await InventoryItem.findOne(query);
      if (currentItem && body.quantity > currentItem.quantity) {
        body.lastRestocked = new Date();
        body.lastRestockedBy = session.userId;
      }
    }

    const item = await InventoryItem.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    });
    
    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }
    
    // Build populate options with tenant filter
    const medicinePopulateOptions: any = {
      path: 'medicineId',
      select: 'name genericName',
    };
    if (tenantId) {
      medicinePopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      medicinePopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await item.populate(medicinePopulateOptions);
    await item.populate('lastRestockedBy', 'name');

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error updating inventory item:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update inventory item' },
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

  // Only admin can delete inventory
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
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
    
    const item = await InventoryItem.findOneAndDelete(query);

    if (!item) {
      return NextResponse.json(
        { success: false, error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting inventory item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete inventory item' },
      { status: 500 }
    );
  }
}

