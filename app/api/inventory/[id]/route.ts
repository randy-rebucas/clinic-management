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
import { recordMovement, type MovementInput } from '@/lib/inventory-movements';

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

    const current = await InventoryItem.findOne(tenantFilter(ctx.tenantId, { _id: id }))
      .select('quantity expiryDate')
      .lean<{ quantity: number; expiryDate?: Date }>();
    if (!current) return notFound('Inventory item');

    const now = new Date();
    const expiredNow = Boolean(current.expiryDate && new Date(current.expiryDate) < now);
    const filter: Record<string, unknown> = tenantFilter(ctx.tenantId, { _id: id });
    const $set: Record<string, unknown> = { ...fields };
    const $unset: Record<string, 1> = {};
    const update: Record<string, unknown> = {};
    // Ledger lines to write once the change has landed; `after` is filled from the saved stock.
    const lines: Array<Omit<MovementInput, 'quantityAfter' | 'tenantId' | 'item'> & { quantityAfter?: number }> = [];

    if (expiryDate === null) $unset.expiryDate = 1;
    else if (expiryDate !== undefined) $set.expiryDate = expiryDate;

    const restocking = (delta !== undefined && delta > 0 && kind !== 'adjustment') || kind === 'restock';
    const discarding = restocking && discardExpired && expiredNow && current.quantity > 0;

    if (delta !== undefined && discarding) {
      // Expired units go out and the delivery comes in, in one write guarded on the stock read above.
      $set.quantity = delta;
      filter.quantity = current.quantity;
      lines.push({ type: 'adjustment', change: -current.quantity, quantityAfter: 0, reasonCode: 'expired', reason: 'Expired stock removed before restocking' });
    } else if (delta !== undefined) {
      // Relative change applied atomically so concurrent restocks/adjustments don't overwrite each other.
      update.$inc = { quantity: delta };
      if (delta < 0) filter.quantity = { $gte: -delta };
    } else if (fields.quantity !== undefined) {
      // A count sets the stock; guarded so a dispense that landed meanwhile isn't silently erased.
      filter.quantity = current.quantity;
    }

    const change = delta ?? (fields.quantity !== undefined ? fields.quantity - current.quantity : 0);
    if (change !== 0) {
      lines.push({
        type: restocking ? 'restock' : delta !== undefined ? 'adjustment' : 'count',
        change,
        ...(reasonCode && !restocking ? { reasonCode } : {}),
        ...(reason ? { reason } : {}),
        ...(restocking
          ? {
              unitCost: fields.unitCost,
              supplier: fields.supplier,
              reference,
              batchExpiry,
            }
          : {}),
      });
    }

    if (restocking) {
      $set.lastRestocked = now;
      $set.lastRestockedBy = ctx.session.userId;
      // One expiry per item: a new batch replaces an expired or empty one; otherwise the earlier date stands.
      if (batchExpiry) {
        const keepOld = current.expiryDate && !expiredNow && !discarding && current.quantity > 0 && new Date(current.expiryDate) < batchExpiry;
        if (!keepOld) $set.expiryDate = batchExpiry;
      }
    }

    for (const k of Object.keys($set)) if ($set[k] === undefined) delete $set[k];
    if (Object.keys($set).length > 0) update.$set = $set;
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const item = await InventoryItem.findOneAndUpdate(filter, update, {
      new: true,
      runValidators: true,
    });

    if (!item) {
      const exists = await InventoryItem.exists(tenantFilter(ctx.tenantId, { _id: id }));
      if (!exists) return notFound('Inventory item');
      return NextResponse.json(
        {
          success: false,
          error:
            delta !== undefined && delta < 0
              ? 'There isn’t that much in stock'
              : 'The stock changed while you were working (something was dispensed or restocked). Check the new figure and try again.',
        },
        { status: 409 }
      );
    }

    // Write the ledger: the last line ends at the saved stock, earlier ones at their own point.
    const performer = { performedBy: ctx.session.userId };
    for (let i = 0; i < lines.length; i++) {
      await recordMovement({
        tenantId: ctx.tenantObjectId,
        item: item._id,
        ...lines[i],
        quantityAfter: i === lines.length - 1 ? item.quantity : (lines[i].quantityAfter ?? item.quantity),
        ...performer,
      });
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
