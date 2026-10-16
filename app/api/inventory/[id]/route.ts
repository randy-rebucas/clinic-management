import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { inventoryUpdateSchema, medicinePopulate } from '../schema';

function ensureModels() {
  if (!mongoose.models.Medicine) void Medicine;
  if (!mongoose.models.User) void User;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'inventory', 'read');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Inventory item');

  try {
    await connectDB();
    ensureModels();

    const item = await InventoryItem.findOne(tenantFilter(ctx.tenantId, { _id: id }))
      .populate(medicinePopulate(tenantFilter(ctx.tenantId)))
      .populate('lastRestockedBy', 'name')
      .lean()
      .exec();

    if (!item) return notFound('Inventory item');

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch inventory item' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'inventory', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Inventory item');

  const parsed = await parseBody(request, inventoryUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  const { delta, ...fields } = parsed.data;

  try {
    await connectDB();
    ensureModels();

    if (fields.medicineId) {
      const medicine = await Medicine.findOne(tenantFilter(ctx.tenantId, { _id: fields.medicineId })).select('_id').lean();
      if (!medicine) {
        return NextResponse.json(
          { success: false, error: 'Invalid medicine selected. Please select a medicine from this clinic.' },
          { status: 400 }
        );
      }
    }

    const filter: Record<string, unknown> = tenantFilter(ctx.tenantId, { _id: id });
    const $set: Record<string, unknown> = { ...fields };
    const update: Record<string, unknown> = {};

    if (delta !== undefined) {
      // Relative change applied atomically so concurrent restocks/adjustments don't overwrite each other.
      update.$inc = { quantity: delta };
      if (delta < 0) {
        filter.quantity = { $gte: -delta };
      } else {
        $set.lastRestocked = new Date();
        $set.lastRestockedBy = ctx.session.userId;
      }
    } else if (fields.quantity !== undefined) {
      const current = await InventoryItem.findOne(tenantFilter(ctx.tenantId, { _id: id })).select('quantity').lean<{ quantity: number }>();
      if (!current) return notFound('Inventory item');
      if (fields.quantity > current.quantity) {
        $set.lastRestocked = new Date();
        $set.lastRestockedBy = ctx.session.userId;
      }
    }

    if (Object.keys($set).length > 0) update.$set = $set;

    const item = await InventoryItem.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });

    if (!item) {
      if (delta !== undefined && delta < 0) {
        const exists = await InventoryItem.exists(tenantFilter(ctx.tenantId, { _id: id }));
        if (exists) {
          return NextResponse.json(
            { success: false, error: 'Insufficient stock' },
            { status: 409 }
          );
        }
      }
      return notFound('Inventory item');
    }

    await item.populate(medicinePopulate(tenantFilter(ctx.tenantId)));
    await item.populate('lastRestockedBy', 'name');

    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error updating inventory item:', error);
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
      { success: false, error: 'Failed to update inventory item' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'inventory', 'delete');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Inventory item');

  try {
    await connectDB();

    const item = await InventoryItem.findOneAndDelete(tenantFilter(ctx.tenantId, { _id: id }));
    if (!item) return notFound('Inventory item');

    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete inventory item' },
      { status: 500 }
    );
  }
}
