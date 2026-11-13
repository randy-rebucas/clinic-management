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
import { applyStockChange } from '@/lib/inventory-stock';
import { changedSentence, inventoryChanges, logInventoryChange, stockWords } from '../_lib/inventory-audit';

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
  const { delta, kind, reasonCode, reason, reference, batchExpiry, discardExpired, ...rest } = parsed.data;
  const { expiryDate, ...fields } = rest;

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

    // The details too, so an edit can be logged with what it changed.
    const current = await InventoryItem.findOne(tenantFilter(ctx.tenantId, { _id: id }))
      .select('name category sku unit reorderLevel reorderQuantity unitCost supplier location expiryDate notes medicineId quantity')
      .lean<{ quantity: number; expiryDate?: Date } & Record<string, any>>();
    if (!current) return notFound('Inventory item');

    const result = await applyStockChange({
      filter: tenantFilter(ctx.tenantId, { _id: id }),
      tenantId: ctx.tenantObjectId,
      current,
      input: { fields, expiryDate, delta, kind, reasonCode, reason, reference, batchExpiry, discardExpired },
      performedBy: ctx.session.userId,
    });
    if (!result.ok) {
      if (result.reason === 'not-found') return notFound('Inventory item');
      return NextResponse.json(
        {
          success: false,
          error:
            result.reason === 'short'
              ? 'There isn’t that much in stock'
              : 'The stock changed while you were working (something was dispensed or restocked). Check the new figure and try again.',
        },
        { status: 409 }
      );
    }
    const { item, restocking } = result;

    // An edit of the item's details. A restock's cost and supplier are the delivery's, and stock
    // in and out is the ledger's; neither is logged here.
    if (!restocking) {
      const sent = [...Object.keys(fields), ...(expiryDate !== undefined ? ['expiryDate'] : [])].filter((k) => k !== 'quantity');
      const changes = sent.length ? await inventoryChanges(ctx.tenantId, current, item.toObject(), sent) : [];
      if (changes.length) {
        await logInventoryChange(ctx, request, {
          action: 'update',
          itemId: item._id,
          description: changedSentence(item.name, changes),
          changes,
        });
      }
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

    // The item's ledger can't be opened once it is gone, so the stock it held is kept here.
    await logInventoryChange(ctx, request, {
      action: 'delete',
      itemId: item._id,
      description: `Removed ${item.name} from inventory${item.quantity > 0 ? `; ${stockWords(item.quantity, item.unit)} were on hand` : ''}`,
      metadata: { category: item.category, quantity: item.quantity, unit: item.unit, unitCost: item.unitCost, sku: item.sku },
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete inventory item' },
      { status: 500 }
    );
  }
}
