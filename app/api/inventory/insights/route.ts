import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import InventoryItem from '@/models/Inventory';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { EXPIRY, expiryRange } from '@/lib/inventory';

/**
 * GET /api/inventory/insights
 * Items by status with the stock value at cost, the items furthest under their reorder level,
 * and stock on the shelf by how soon it expires. Aggregations only.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'inventory', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const scope = { tenantId: tenantObjectId };
    const now = new Date();
    const value = { $multiply: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$unitCost', 0] }] };

    const expiryBranches = EXPIRY.map((e) => {
      const r = expiryRange(e.key, now);
      const conds: unknown[] = [{ $lt: ['$expiryDate', r.$lt] }];
      if (r.$gte) conds.push({ $gte: ['$expiryDate', r.$gte] });
      return { case: { $and: conds }, then: e.key };
    });

    const [statusRows, reorder, expiryRows] = await Promise.all([
      InventoryItem.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 }, value: { $sum: value } } }]),
      InventoryItem.aggregate([
        { $match: { ...scope, status: { $in: ['low-stock', 'out-of-stock'] } } },
        { $addFields: { cover: { $divide: [{ $ifNull: ['$quantity', 0] }, { $max: [{ $ifNull: ['$reorderLevel', 0] }, 1] }] } } },
        { $sort: { cover: 1, name: 1 } },
        { $limit: 6 },
        { $project: { name: 1, quantity: 1, reorderLevel: 1, reorderQuantity: 1, unit: 1, status: 1 } },
      ]),
      InventoryItem.aggregate([
        { $match: { ...scope, quantity: { $gt: 0 }, expiryDate: { $ne: null, $lt: expiryRange('180', now).$lt } } },
        { $group: { _id: { $switch: { branches: expiryBranches, default: null } }, n: { $sum: 1 }, value: { $sum: value } } },
      ]),
    ]);

    const round = (v: number) => Math.round(v * 100) / 100;
    const byExpiry = new Map(expiryRows.map((r: { _id: string; n: number; value: number }) => [r._id, r]));

    return NextResponse.json({
      success: true,
      data: {
        status: Object.fromEntries(statusRows.map((r: { _id: string; n: number }) => [r._id || 'in-stock', r.n])),
        items: statusRows.reduce((s: number, r: { n: number }) => s + r.n, 0),
        value: round(statusRows.reduce((s: number, r: { value: number }) => s + (r.value || 0), 0)),
        reorder,
        expiry: EXPIRY.map((e) => ({ key: e.key, count: byExpiry.get(e.key)?.n ?? 0, value: round(byExpiry.get(e.key)?.value ?? 0) })),
      },
    });
  } catch (error) {
    console.error('Error building inventory insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load stock figures' }, { status: 500 });
  }
}
