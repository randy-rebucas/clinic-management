import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission, forbiddenResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Inventory access - admin only for now (can be extended with inventory permission)
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required for inventory');
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
    
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const lowStock = searchParams.get('lowStock') === 'true';

    let query: any = {};
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }
    if (lowStock) {
      query.status = { $in: ['low-stock', 'out-of-stock'] };
    }

    const items = await InventoryItem.find(query)
      .populate('medicineId', 'name genericName')
      .populate('lastRestockedBy', 'name')
      .sort({ name: 1 })
      .lean()
      .exec();

    return NextResponse.json({ success: true, data: items || [] });
  } catch (error: any) {
    console.error('Error fetching inventory:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    const errorMessage = error?.message || 'Failed to fetch inventory';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can add inventory items
  if (session.role !== 'admin') {
    return forbiddenResponse('Admin access required for inventory management');
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
    
    const body = await request.json();

    const item = await InventoryItem.create(body);
    await item.populate('medicineId', 'name genericName');
    await item.populate('lastRestockedBy', 'name');

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating inventory item:', error);
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
      { success: false, error: error.message || 'Failed to create inventory item' },
      { status: 500 }
    );
  }
}

