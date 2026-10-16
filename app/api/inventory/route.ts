import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { INVENTORY_CATEGORIES, INVENTORY_STATUSES, inventoryCreateSchema, medicinePopulate } from './schema';

function ensureModels() {
  if (!mongoose.models.Medicine) void Medicine;
  if (!mongoose.models.User) void User;
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'inventory', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    ensureModels();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const lowStock = searchParams.get('lowStock') === 'true';

    const query: Record<string, unknown> = tenantFilter(ctx.tenantId);

    if (category && (INVENTORY_CATEGORIES as readonly string[]).includes(category)) {
      query.category = category;
    }
    if (status && (INVENTORY_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }
    if (lowStock) {
      query.status = { $in: ['low-stock', 'out-of-stock'] };
    }

    const items = await InventoryItem.find(query)
      .populate(medicinePopulate(tenantFilter(ctx.tenantId)))
      .populate('lastRestockedBy', 'name')
      .sort({ name: 1 })
      .lean()
      .exec();

    return NextResponse.json({ success: true, data: items || [] });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'inventory', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, inventoryCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  try {
    await connectDB();
    ensureModels();

    if (body.medicineId) {
      const medicine = await Medicine.findOne(tenantFilter(ctx.tenantId, { _id: body.medicineId })).select('_id').lean();
      if (!medicine) {
        return NextResponse.json(
          { success: false, error: 'Invalid medicine selected. Please select a medicine from this clinic.' },
          { status: 400 }
        );
      }
    }

    const item = await InventoryItem.create({ ...body, tenantId: ctx.tenantObjectId });

    await item.populate(medicinePopulate(tenantFilter(ctx.tenantId)));
    await item.populate('lastRestockedBy', 'name');

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating inventory item:', error);
    if (error?.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid inventory item data' },
        { status: 400 }
      );
    }
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'An inventory item with this SKU already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create inventory item' },
      { status: 500 }
    );
  }
}
