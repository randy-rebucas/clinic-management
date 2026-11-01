import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import InventoryItem from '@/models/Inventory';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import RepDelivery, { REP_DELIVERY_STATUSES, type IRepDelivery } from '@/models/RepDelivery';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { escapeRegex } from '@/lib/rep-deliveries';

/** Rep-only fields the clinic doesn't see. */
const CLINIC_HIDDEN_DELIVERY_FIELDS = '-tenantId -userId';

/**
 * GET /api/rep-deliveries
 * Samples and deliveries reps recorded for this clinic (admins). Query: status? (pending |
 * received | rejected | cancelled), page, limit (default 50, max 100). `counts` has the number in
 * each status. Pending deliveries carry `stockMatches` per line: up to 5 of the clinic's stock
 * items whose name contains the product's, to receive the units into.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Admin access required', 'medical-representatives');

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50));

    const base = { clinicId: ctx.tenantObjectId };
    const query: Record<string, unknown> = { ...base };
    const status = sp.get('status');
    if (status) {
      if (!(REP_DELIVERY_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      query.status = status;
    }

    await connectDB();
    // Waiting ones oldest first, so the longest-waiting is on top; the rest newest first.
    const [deliveries, total, counts] = await Promise.all([
      RepDelivery.find(query)
        .select(CLINIC_HIDDEN_DELIVERY_FIELDS)
        .sort({ createdAt: status === 'pending' ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<(IRepDelivery & { _id: unknown })[]>(),
      RepDelivery.countDocuments(query),
      RepDelivery.aggregate<{ _id: string; n: number }>([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);

    // The visit each delivery came with, as a date and time the clinic recognises.
    const visits = await MedicalRepresentativeVisit.find({ _id: { $in: deliveries.map((d) => d.visitId) } })
      .select('date time purpose')
      .lean<{ _id: unknown; date: Date; time: string; purpose: string }[]>();
    const visitById = new Map(visits.map((v) => [String(v._id), { date: v.date, time: v.time, purpose: v.purpose }]));

    const matchCache = new Map<string, unknown[]>();
    const stockMatches = async (name: string) => {
      const key = name.toLowerCase();
      if (!matchCache.has(key)) {
        matchCache.set(
          key,
          await InventoryItem.find({ tenantId: ctx.tenantObjectId, name: { $regex: escapeRegex(name), $options: 'i' } })
            .select('name quantity unit expiryDate')
            .sort({ name: 1 })
            .limit(5)
            .lean()
        );
      }
      return matchCache.get(key);
    };

    const data = await Promise.all(
      deliveries.map(async (d) => ({
        ...d,
        visit: visitById.get(String(d.visitId)) ?? null,
        lines:
          d.status === 'pending'
            ? await Promise.all(d.lines.map(async (l) => ({ ...l, stockMatches: await stockMatches(l.productName) })))
            : d.lines,
      }))
    );

    return NextResponse.json({
      success: true,
      data,
      counts: Object.fromEntries(REP_DELIVERY_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Get clinic rep deliveries error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch rep deliveries' }, { status: 500 });
  }
}
