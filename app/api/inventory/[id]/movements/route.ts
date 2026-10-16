import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import InventoryItem from '@/models/Inventory';
import InventoryMovement from '@/models/InventoryMovement';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeOffsetInTz, formatInTz } from '@/lib/tz';
import { USAGE_MATCH } from '@/lib/inventory-movements';

const WINDOW_DAYS = 60;
const HISTORY_LIMIT = 50;

/**
 * GET /api/inventory/[id]/movements
 * The item's stock ledger (newest first), its stock at the end of each of the last 60 days, and
 * how much was used in the last 30. Days before the first recorded change have no figure: the
 * ledger starts when stock changes began to be recorded, and earlier stock is not guessed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'inventory', 'read');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Inventory item');

  try {
    await connectDB();
    const itemId = new Types.ObjectId(id);
    const exists = await InventoryItem.exists(tenantFilter(tenantId, { _id: itemId }));
    if (!exists) return notFound('Inventory item');

    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const start = dayRangeOffsetInTz(-(WINDOW_DAYS - 1), now, tz).start;
    const scope = { tenantId: tenantObjectId, item: itemId };

    const [recent, total, inWindow, prior, used] = await Promise.all([
      InventoryMovement.find(scope).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT).populate({ path: 'performedBy', select: 'name', model: User }).lean(),
      InventoryMovement.countDocuments(scope),
      InventoryMovement.find({ ...scope, createdAt: { $gte: start } }).select('change quantityAfter createdAt').sort({ createdAt: 1, _id: 1 }).lean(),
      InventoryMovement.findOne({ ...scope, createdAt: { $lt: start } }).select('quantityAfter').sort({ createdAt: -1, _id: -1 }).lean(),
      InventoryMovement.aggregate([
        { $match: { ...scope, createdAt: { $gte: new Date(now.getTime() - 30 * 86_400_000) }, ...USAGE_MATCH } },
        { $group: { _id: null, used: { $sum: { $multiply: ['$change', -1] } } } },
      ]),
    ]);

    // End-of-day stock per day; null until the first recorded change.
    const lastByDay = new Map<string, number>();
    for (const m of inWindow) lastByDay.set(formatInTz(m.createdAt, 'yyyy-MM-dd', tz), m.quantityAfter);
    let level: number | null = prior ? prior.quantityAfter : null;
    const days: { date: string; quantity: number | null }[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const key = formatInTz(dayRangeOffsetInTz(-i, now, tz).start, 'yyyy-MM-dd', tz);
      if (lastByDay.has(key)) level = lastByDay.get(key)!;
      days.push({ date: key, quantity: level });
    }

    return NextResponse.json({
      success: true,
      data: {
        today: formatInTz(now, 'yyyy-MM-dd', tz),
        movements: recent,
        total,
        days: total > 0 ? days : [],
        used30: used[0]?.used ?? 0,
      },
    });
  } catch (error) {
    console.error('Error loading inventory movements:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the stock history' }, { status: 500 });
  }
}
