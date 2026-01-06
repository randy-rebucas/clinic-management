import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission, forbiddenResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const lowStock = searchParams.get('lowStock') === 'true';

    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    if (category) {
      query.category = category;
    }
    if (status) {
      query.status = status;
    }
    if (lowStock) {
      query.status = { $in: ['low-stock', 'out-of-stock'] };
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

    const items = await InventoryItem.find(query)
      .populate(medicinePopulateOptions)
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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Validate that the medicine belongs to the tenant
    if (body.medicineId && tenantId) {
      const medicineQuery: any = {
        _id: body.medicineId,
        tenantId: new Types.ObjectId(tenantId),
      };
      const medicine = await Medicine.findOne(medicineQuery);
      if (!medicine) {
        return NextResponse.json(
          { success: false, error: 'Invalid medicine selected. Please select a medicine from this clinic.' },
          { status: 400 }
        );
      }
    }

    // Ensure inventory item is created with tenantId
    const itemData: any = { ...body };
    if (tenantId && !itemData.tenantId) {
      itemData.tenantId = new Types.ObjectId(tenantId);
    }

    const item = await InventoryItem.create(itemData);
    
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

