import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import InventoryMovement from '@/models/InventoryMovement';
import { recordMovement, USAGE_MATCH } from '@/lib/inventory-movements';
import { expiryRange, isExpiryKey, type InventorySort } from '@/lib/inventory';
import { INVENTORY_CATEGORIES, INVENTORY_STATUSES, inventoryCreateSchema, medicinePopulate } from './schema';
import { logInventoryChange, stockWords } from './_lib/inventory-audit';

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
    const expiry = searchParams.get('expiry');
    const search = (searchParams.get('search') || '').trim().slice(0, 100);
    const sort = (searchParams.get('sort') || 'urgent') as InventorySort;
    const pageParam = searchParams.get('page');
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || 25, 1), 100);

    const query: Record<string, unknown> = tenantFilter(ctx.tenantId);

    if (category && (INVENTORY_CATEGORIES as readonly string[]).includes(category)) {
      query.category = category;
    }
    if (status && (INVENTORY_STATUSES as readonly string[]).includes(status)) {
      query.status = status;
    }
    // "reorder" (and the older lowStock flag) = running low or already out.
    if (lowStock || status === 'reorder') {
      query.status = { $in: ['low-stock', 'out-of-stock'] };
    }
    // Expiry buckets look at stock still on the shelf.
    if (isExpiryKey(expiry)) {
      query.expiryDate = expiryRange(expiry);
      query.quantity = { $gt: 0 };
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: rx }, { sku: rx }, { supplier: rx }, { location: rx }];
    }

    if (pageParam) {
      // Most urgent first: out of stock, expired, low (by how far under the reorder level), then the rest.
      const SORTS: Record<InventorySort, Record<string, 1 | -1>> = {
        urgent: { rank: 1, cover: 1, name: 1 },
        name: { name: 1 },
        expiry: { noExpiry: 1, expiryDate: 1, name: 1 },
        value: { value: -1, name: 1 },
      };
      const [result] = await InventoryItem.aggregate([
        { $match: query },
        {
          $addFields: {
            rank: { $switch: { branches: [{ case: { $eq: ['$status', 'out-of-stock'] }, then: 0 }, { case: { $eq: ['$status', 'expired'] }, then: 1 }, { case: { $eq: ['$status', 'low-stock'] }, then: 2 }], default: 3 } },
            cover: { $divide: [{ $ifNull: ['$quantity', 0] }, { $max: [{ $ifNull: ['$reorderLevel', 0] }, 1] }] },
            noExpiry: { $cond: [{ $ifNull: ['$expiryDate', false] }, 0, 1] },
            value: { $multiply: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$unitCost', 0] }] },
          },
        },
        { $sort: { ...(SORTS[sort] ?? SORTS.urgent), _id: 1 } },
        {
          $facet: {
            rows: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              { $project: { name: 1, category: 1, sku: 1, quantity: 1, unit: 1, reorderLevel: 1, reorderQuantity: 1, unitCost: 1, supplier: 1, location: 1, expiryDate: 1, status: 1, value: 1 } },
            ],
            total: [{ $count: 'n' }],
          },
        },
      ]);
      const rows = result?.rows ?? [];
      const total = result?.total?.[0]?.n ?? 0;

      // How long each item on this page lasts at its use over the last 30 days.
      const since = new Date(Date.now() - 30 * 86_400_000);
      const used = rows.length
        ? await InventoryMovement.aggregate([
            { $match: { tenantId: ctx.tenantObjectId, item: { $in: rows.map((r: { _id: unknown }) => r._id) }, createdAt: { $gte: since }, ...USAGE_MATCH } },
            { $group: { _id: '$item', used: { $sum: { $multiply: ['$change', -1] } } } },
          ])
        : [];
      const usedBy = new Map(used.map((u: { _id: unknown; used: number }) => [String(u._id), u.used]));

      return NextResponse.json({
        success: true,
        data: rows.map((r: { _id: unknown }) => ({ ...r, used30: usedBy.get(String(r._id)) ?? 0 })),
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      });
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
    // The opening stock is the first line of the item's history.
    await recordMovement({
      tenantId: ctx.tenantObjectId,
      item: item._id,
      type: 'opening',
      change: item.quantity,
      quantityAfter: item.quantity,
      performedBy: ctx.session.userId,
    });

    await logInventoryChange(ctx, request, {
      action: 'create',
      itemId: item._id,
      description: `Added ${item.name} to inventory with ${stockWords(item.quantity, item.unit)} on hand`,
      metadata: { category: item.category, quantity: item.quantity, unit: item.unit, unitCost: item.unitCost, sku: item.sku },
    });

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
