import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import InventoryItem from '@/models/Inventory';
import InventoryMovement from '@/models/InventoryMovement';
import { openReport } from '../_lib/report-range';

/**
 * GET /api/reports/inventory?period=|startDate=&endDate=
 * Stock as it stands (value at cost by category, the most valuable items) and what moved in the
 * window from the stock ledger: what was used most (dispensed, or used in the clinic), what came
 * in, and what was lost (damaged, expired). Aggregations only.
 */
export async function GET(request: NextRequest) {
  const open = await openReport(request.nextUrl.searchParams, 'inventory');
  if (open instanceof NextResponse) return open;
  const { tenantObjectId, start, end } = open;

  try {
    await connectDB();
    const scope = { tenantId: tenantObjectId };
    const value = { $multiply: [{ $ifNull: ['$quantity', 0] }, { $ifNull: ['$unitCost', 0] }] };

    const [stock, moves] = await Promise.all([
      InventoryItem.aggregate([
        { $match: scope },
        {
          $facet: {
            byCategory: [{ $group: { _id: '$category', items: { $sum: 1 }, value: { $sum: value } } }],
            byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
            topValue: [{ $addFields: { value } }, { $sort: { value: -1 } }, { $limit: 8 }, { $project: { name: 1, quantity: 1, unit: 1, value: 1 } }],
          },
        },
      ]),
      InventoryMovement.aggregate([
        { $match: { ...scope, createdAt: { $gte: start, $lte: end } } },
        { $addFields: { kind: { $switch: { branches: [
          { case: { $eq: ['$type', 'dispense'] }, then: 'used' },
          { case: { $and: [{ $eq: ['$type', 'adjustment'] }, { $eq: ['$reasonCode', 'used'] }] }, then: 'used' },
          { case: { $and: [{ $eq: ['$type', 'adjustment'] }, { $in: ['$reasonCode', ['damaged', 'expired']] }] }, then: 'lost' },
          { case: { $eq: ['$type', 'restock'] }, then: 'restocked' },
        ], default: 'other' } } } },
        {
          $facet: {
            used: [
              { $match: { kind: 'used' } },
              { $group: { _id: '$item', used: { $sum: { $multiply: ['$change', -1] } } } },
              { $sort: { used: -1 } },
              { $limit: 10 },
              { $lookup: { from: 'inventoryitems', localField: '_id', foreignField: '_id', as: 'i', pipeline: [{ $project: { name: 1, unit: 1, unitCost: 1 } }] } },
              { $project: { used: 1, item: { $first: '$i' } } },
            ],
            totals: [
              { $match: { kind: { $in: ['restocked', 'lost'] } } },
              { $group: { _id: '$kind', moves: { $sum: 1 }, cost: { $sum: { $multiply: [{ $abs: '$change' }, { $ifNull: ['$unitCost', 0] }] } } } },
            ],
          },
        },
      ]),
    ]);

    const round = (v: number) => Math.round((v || 0) * 100) / 100;
    const s = stock[0];
    const m = moves[0];
    const totals = new Map((m.totals as { _id: string; moves: number; cost: number }[]).map((r) => [r._id, r]));

    return NextResponse.json({
      success: true,
      data: {
        range: { start: start.toISOString(), end: end.toISOString() },
        items: (s.byCategory as { items: number }[]).reduce((a, r) => a + r.items, 0),
        value: round((s.byCategory as { value: number }[]).reduce((a, r) => a + r.value, 0)),
        byCategory: Object.fromEntries((s.byCategory as { _id: string; value: number }[]).map((r) => [r._id || 'other', round(r.value)])),
        status: Object.fromEntries((s.byStatus as { _id: string; n: number }[]).map((r) => [r._id || 'in-stock', r.n])),
        topValue: (s.topValue as { _id: string; name: string; quantity: number; unit: string; value: number }[]).map((r) => ({ ...r, value: round(r.value) })),
        mostUsed: (m.used as { _id: string; used: number; item?: { name: string; unit: string; unitCost?: number } }[])
          .filter((r) => r.item)
          .map((r) => ({ _id: r._id, name: r.item!.name, unit: r.item!.unit, used: r.used, cost: round(r.used * (r.item!.unitCost ?? 0)) })),
        restocks: totals.get('restocked')?.moves ?? 0,
        lostMoves: totals.get('lost')?.moves ?? 0,
      },
    });
  } catch (error) {
    console.error('Error generating inventory report:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the inventory report' }, { status: 500 });
  }
}
